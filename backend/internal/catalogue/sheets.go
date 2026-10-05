package catalogue

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

const SheetsBaseURL = "https://sheets.googleapis.com"

// SheetsSource reads the catalogue from a Google Sheet. Columns are matched by header name
// (book_id, title, author, isbn, publisher, publication_year, language, category), so column order
// and extra columns do not matter. Row numbers are never used as identity.
type SheetsSource struct {
	Client        *http.Client // already authorised for the Sheets read-only scope
	BaseURL       string
	SpreadsheetID string
	Range         string
	Log           *slog.Logger
}

func (s SheetsSource) Fetch(ctx context.Context) ([]Book, error) {
	base := s.BaseURL
	if base == "" {
		base = SheetsBaseURL
	}
	u := fmt.Sprintf("%s/v4/spreadsheets/%s/values/%s?majorDimension=ROWS",
		base, url.PathEscape(s.SpreadsheetID), url.PathEscape(s.Range))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sheets request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sheets request: status %d", resp.StatusCode)
	}

	var payload struct {
		Values [][]any `json:"values"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("sheets response: %w", err)
	}
	return ParseRows(payload.Values, s.Log)
}

var requiredColumns = []string{"book_id", "title", "author", "language", "category"}

// ParseRows turns sheet rows (first row = headers) into books. Hand-edited sheets are messy, so bad rows
// are skipped and logged instead of failing the whole catalogue; missing required columns are an error.
func ParseRows(rows [][]any, log *slog.Logger) ([]Book, error) {
	if log == nil {
		log = slog.Default()
	}
	if len(rows) == 0 {
		return []Book{}, nil
	}

	col := map[string]int{}
	for i, h := range rows[0] {
		col[strings.ToLower(strings.TrimSpace(fmt.Sprint(h)))] = i
	}
	for _, name := range requiredColumns {
		if _, ok := col[name]; !ok {
			return nil, fmt.Errorf("catalogue sheet is missing required column %q", name)
		}
	}
	cell := func(row []any, name string) string {
		i, ok := col[name]
		if !ok || i >= len(row) || row[i] == nil {
			return ""
		}
		return strings.TrimSpace(fmt.Sprint(row[i]))
	}

	books := make([]Book, 0, len(rows)-1)
	seen := map[string]bool{}
	for n, row := range rows[1:] {
		sheetRow := n + 2 // only used in log messages
		b := Book{
			ID:        cell(row, "book_id"),
			Title:     cell(row, "title"),
			Author:    cell(row, "author"),
			ISBN:      strings.NewReplacer("-", "", " ", "").Replace(cell(row, "isbn")),
			Publisher: cell(row, "publisher"),
			Language:  NormaliseLanguage(cell(row, "language")),
			Category:  cell(row, "category"),
		}
		if y, err := strconv.Atoi(cell(row, "publication_year")); err == nil && y > 0 {
			b.PublicationYear = &y
		}
		switch {
		case b.ID == "" && b.Title == "":
			continue // blank row
		case b.ID == "" || b.Title == "" || b.Author == "":
			log.Warn("catalogue row skipped: book_id, title and author are required", "sheetRow", sheetRow)
		case seen[b.ID]:
			log.Warn("catalogue row skipped: duplicate book_id", "sheetRow", sheetRow, "bookId", b.ID)
		default:
			seen[b.ID] = true
			books = append(books, b)
		}
	}
	return books, nil
}

// NormaliseLanguage maps common spellings to the two canonical labels the UI knows; others pass through.
func NormaliseLanguage(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "english", "en", "eng":
		return "English"
	case "bahasa melayu", "bahasa malaysia", "malay", "bm", "ms", "melayu":
		return "Bahasa Melayu"
	}
	return strings.TrimSpace(raw)
}

// tabName returns the sheet tab from an A1 range such as "Catalogue!A:H" (or the whole string if there is none).
func tabName(rangeA1 string) string {
	if i := strings.LastIndex(rangeA1, "!"); i >= 0 {
		return strings.Trim(rangeA1[:i], "'")
	}
	return rangeA1
}

// Append writes one row at the bottom of the tab, placing each value under its header. Values are sent
// as RAW so a title like "=HYPERLINK(...)" is stored as text and never evaluated as a formula.
func (s SheetsSource) Append(ctx context.Context, b Book, addedBy string) error {
	base := s.BaseURL
	if base == "" {
		base = SheetsBaseURL
	}
	tab := tabName(s.Range)

	header, err := s.getValues(ctx, base, tab+"!1:1")
	if err != nil {
		return err
	}
	if len(header) == 0 || len(header[0]) == 0 {
		return errors.New("catalogue sheet has no header row")
	}
	row := make([]any, len(header[0]))
	for i, h := range header[0] {
		switch strings.ToLower(strings.TrimSpace(fmt.Sprint(h))) {
		case "book_id":
			row[i] = b.ID
		case "title":
			row[i] = b.Title
		case "author":
			row[i] = b.Author
		case "isbn":
			row[i] = b.ISBN
		case "publisher":
			row[i] = b.Publisher
		case "publication_year":
			if b.PublicationYear != nil {
				row[i] = *b.PublicationYear
			} else {
				row[i] = ""
			}
		case "language":
			row[i] = b.Language
		case "category":
			row[i] = b.Category
		case "added_by":
			row[i] = addedBy
		default:
			row[i] = ""
		}
	}

	body, _ := json.Marshal(map[string]any{"values": [][]any{row}})
	u := fmt.Sprintf("%s/v4/spreadsheets/%s/values/%s:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
		base, url.PathEscape(s.SpreadsheetID), url.PathEscape(tab))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.Client.Do(req)
	if err != nil {
		return fmt.Errorf("sheets append: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("sheets append: status %d", resp.StatusCode)
	}
	return nil
}

func (s SheetsSource) getValues(ctx context.Context, base, rangeA1 string) ([][]any, error) {
	u := fmt.Sprintf("%s/v4/spreadsheets/%s/values/%s?majorDimension=ROWS", base, url.PathEscape(s.SpreadsheetID), url.PathEscape(rangeA1))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sheets request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sheets request: status %d", resp.StatusCode)
	}
	var payload struct {
		Values [][]any `json:"values"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("sheets response: %w", err)
	}
	return payload.Values, nil
}
