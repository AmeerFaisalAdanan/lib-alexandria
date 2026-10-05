package catalogue

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func rows(data ...[]any) [][]any { return data }

func TestParseRowsMatchesHeadersAndSkipsBadRows(t *testing.T) {
	got, err := ParseRows(rows(
		[]any{"Title", "book_id", "author", "Language", "category", "isbn", "publication_year", "notes"},
		[]any{"Ihya", "bk-1", "Al-Ghazali", "bm", "Kitab Turath", "978-967-0000-01-5", "2019", "ignored"},
		[]any{"No id", "", "X", "English", "Fiqh"},
		[]any{"Duplicate", "bk-1", "Y", "English", "Fiqh"},
		[]any{"", "", "", "", ""},
		[]any{"Plain", "bk-2", "Z", "English", "History"},
	), slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("want 2 books, got %d: %+v", len(got), got)
	}
	b := got[0]
	if b.ID != "bk-1" || b.Language != "Bahasa Melayu" || b.ISBN != "9789670000015" || b.PublicationYear == nil || *b.PublicationYear != 2019 {
		t.Errorf("unexpected first book: %+v", b)
	}
	if got[1].PublicationYear != nil {
		t.Error("missing year should stay nil")
	}
}

func TestParseRowsRequiresIDColumn(t *testing.T) {
	_, err := ParseRows(rows([]any{"title", "author", "language", "category"}, []any{"a", "b", "c", "d"}), nil)
	if err == nil || !strings.Contains(err.Error(), "book_id") {
		t.Fatalf("a sheet without a book_id column must be rejected (row numbers are never ids), got %v", err)
	}
}

func TestSheetsSourceFetch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/v4/spreadsheets/sheet-123/values/") {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"values":[["book_id","title","author","language","category"],["bk-1","T","A","English","C"]]}`))
	}))
	defer srv.Close()

	books, err := SheetsSource{Client: srv.Client(), BaseURL: srv.URL, SpreadsheetID: "sheet-123", Range: "Catalogue!A:H"}.Fetch(context.Background())
	if err != nil || len(books) != 1 || books[0].ID != "bk-1" {
		t.Fatalf("books=%+v err=%v", books, err)
	}
}

func TestSheetsSourceErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusForbidden) }))
	defer srv.Close()
	if _, err := (SheetsSource{Client: srv.Client(), BaseURL: srv.URL, SpreadsheetID: "s", Range: "r"}).Fetch(context.Background()); err == nil {
		t.Fatal("expected an error")
	}
}

type fakeSource struct {
	books []Book
	err   error
	calls int
}

func (f *fakeSource) Fetch(context.Context) ([]Book, error) { f.calls++; return f.books, f.err }

func TestCacheServesFromMemoryAndFallsBackToStale(t *testing.T) {
	src := &fakeSource{books: []Book{{ID: "a", Title: "A"}}}
	mirrored := 0
	c := NewCache(src, time.Minute, slog.New(slog.DiscardHandler), func(context.Context, []Book) error { mirrored++; return nil })
	now := time.Now()
	c.now = func() time.Time { return now }

	for range 3 {
		if _, err := c.ListBooks(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if src.calls != 1 || mirrored != 1 {
		t.Fatalf("within the TTL the source must be hit once (calls=%d mirrored=%d)", src.calls, mirrored)
	}

	now = now.Add(2 * time.Minute)
	src.err = errors.New("sheets down")
	b, ok, err := c.GetBook(context.Background(), "a")
	if err != nil || !ok || b.Title != "A" {
		t.Fatalf("a failed refresh must keep serving the last good copy: %+v %v %v", b, ok, err)
	}
}

func TestCacheFirstFetchFailureIsAnError(t *testing.T) {
	c := NewCache(&fakeSource{err: errors.New("down")}, time.Minute, slog.New(slog.DiscardHandler), nil)
	if _, err := c.ListBooks(context.Background()); err == nil {
		t.Fatal("expected an error when there is no copy to fall back on")
	}
}

func TestFindDuplicate(t *testing.T) {
	books := []Book{{ID: "1", Title: "Ihya Ulum", Author: "Al-Ghazali", ISBN: "9789670000015"}}
	cases := map[string]struct {
		in   Book
		want bool
	}{
		"same isbn, different formatting": {Book{Title: "x", Author: "y", ISBN: "978-967-0000-015"}, true},
		"same title and author, folded":   {Book{Title: "  ihya   ULUM ", Author: "AL-ghazali"}, true},
		"same title, different author":    {Book{Title: "Ihya Ulum", Author: "Someone Else"}, false},
		"empty isbn never matches":        {Book{Title: "other", Author: "other"}, false},
	}
	for name, c := range cases {
		if _, got := FindDuplicate(books, c.in); got != c.want {
			t.Errorf("%s: got %v want %v", name, got, c.want)
		}
	}
}

func TestSheetsAppendPlacesValuesUnderHeadersAsRaw(t *testing.T) {
	var gotQuery, gotPath string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet:
			// Header row in a different order, with an extra column and an added_by column.
			_, _ = w.Write([]byte(`{"values":[["category","Title","notes","book_id","author","added_by","language","publication_year","isbn","publisher"]]}`))
		case r.Method == http.MethodPost:
			gotPath, gotQuery = r.URL.EscapedPath(), r.URL.RawQuery
			_ = json.NewDecoder(r.Body).Decode(&gotBody)
			_, _ = w.Write([]byte(`{}`))
		}
	}))
	defer srv.Close()

	year := 2018
	err := SheetsSource{Client: srv.Client(), BaseURL: srv.URL, SpreadsheetID: "sheet-1", Range: "Catalogue!A:J"}.
		Append(context.Background(), Book{ID: "bk-x", Title: `=HYPERLINK("http://evil","click")`, Author: "A", Language: "English", Category: "Fiqh", PublicationYear: &year}, "ada@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(gotPath, "/values/Catalogue:append") || !strings.Contains(gotQuery, "valueInputOption=RAW") {
		t.Errorf("path=%s query=%s: must append with RAW so formulas are never evaluated", gotPath, gotQuery)
	}
	row := gotBody["values"].([]any)[0].([]any)
	want := []any{"Fiqh", `=HYPERLINK("http://evil","click")`, "", "bk-x", "A", "ada@example.com", "English", float64(2018), "", ""}
	if len(row) != len(want) {
		t.Fatalf("row=%v", row)
	}
	for i := range want {
		if row[i] != want[i] {
			t.Errorf("column %d = %v, want %v", i, row[i], want[i])
		}
	}
}

func TestSheetsAppendFailureIsAnError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`{"values":[["book_id","title","author","language","category"]]}`))
			return
		}
		w.WriteHeader(http.StatusForbidden) // e.g. the sheet was shared as Viewer only
	}))
	defer srv.Close()
	err := SheetsSource{Client: srv.Client(), BaseURL: srv.URL, SpreadsheetID: "s", Range: "Catalogue!A:E"}.Append(context.Background(), Book{ID: "x"}, "")
	if err == nil {
		t.Fatal("expected an error")
	}
}

func TestCachePublishMakesBookVisibleAtOnce(t *testing.T) {
	src := &FixtureSource{Path: filepath.Join(t.TempDir(), "c.json")}
	if err := os.WriteFile(src.Path, []byte(`[{"id":"a","title":"A","author":"X","language":"English","category":"C"}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	mirrored := 0
	c := NewCache(src, time.Hour, slog.New(slog.DiscardHandler), func(_ context.Context, b []Book) error { mirrored += len(b); return nil })
	if err := c.Publish(context.Background(), Book{ID: "b", Title: "B", Author: "Y", Language: "English", Category: "C"}, "u"); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := c.GetBook(context.Background(), "b"); !ok {
		t.Fatal("published book must be visible without waiting for the TTL")
	}
	if books, _ := c.ListBooks(context.Background()); len(books) != 2 {
		t.Fatalf("want 2 books, got %d", len(books))
	}
	if mirrored != 2 { // 1 from the first load + the published one
		t.Errorf("mirror calls = %d", mirrored)
	}
	if err := NewCache(readOnly{}, time.Hour, slog.New(slog.DiscardHandler), nil).Publish(context.Background(), Book{}, ""); err != ErrReadOnly {
		t.Errorf("read-only source: %v", err)
	}
}

type readOnly struct{}

func (readOnly) Fetch(context.Context) ([]Book, error) { return nil, nil }
