package lookup

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

const (
	OpenLibraryBaseURL = "https://openlibrary.org"
	GoogleBooksBaseURL = "https://www.googleapis.com"
)

var yearRe = regexp.MustCompile(`\b(1[0-9]{3}|20[0-9]{2})\b`)

func yearOf(s string) *int {
	if m := yearRe.FindString(s); m != "" {
		y, _ := strconv.Atoi(m)
		return &y
	}
	return nil
}

func getJSON(ctx context.Context, c *http.Client, u string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "lib-alexandria/1.0 (book lookup)")
	resp, err := c.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(dst)
}

// OpenLibrary looks an ISBN up on openlibrary.org (no key needed).
type OpenLibrary struct {
	Client  *http.Client
	BaseURL string
}

func (o OpenLibrary) ByISBN(ctx context.Context, isbn string) (Info, bool, error) {
	base := o.BaseURL
	if base == "" {
		base = OpenLibraryBaseURL
	}
	key := "ISBN:" + isbn
	var res map[string]struct {
		Title       string                  `json:"title"`
		Subtitle    string                  `json:"subtitle"`
		Authors     []struct{ Name string } `json:"authors"`
		Publishers  []struct{ Name string } `json:"publishers"`
		PublishDate string                  `json:"publish_date"`
	}
	u := fmt.Sprintf("%s/api/books?bibkeys=%s&format=json&jscmd=data", base, url.QueryEscape(key))
	if err := getJSON(ctx, o.Client, u, &res); err != nil {
		return Info{}, false, fmt.Errorf("open library: %w", err)
	}
	b, ok := res[key]
	if !ok || strings.TrimSpace(b.Title) == "" {
		return Info{}, false, nil
	}
	info := Info{Title: b.Title, PublicationYear: yearOf(b.PublishDate)}
	if b.Subtitle != "" {
		info.Title += ": " + b.Subtitle
	}
	names := make([]string, 0, len(b.Authors))
	for _, a := range b.Authors {
		names = append(names, a.Name)
	}
	info.Author = strings.Join(names, ", ")
	if len(b.Publishers) > 0 {
		info.Publisher = b.Publishers[0].Name
	}
	return info, true, nil
}

// GoogleBooks looks an ISBN up through the Google Books API. It works without a key, but the keyless quota
// is shared and often exhausted (HTTP 429); set APIKey for reliable use.
type GoogleBooks struct {
	Client  *http.Client
	BaseURL string
	APIKey  string
}

func (g GoogleBooks) ByISBN(ctx context.Context, isbn string) (Info, bool, error) {
	base := g.BaseURL
	if base == "" {
		base = GoogleBooksBaseURL
	}
	var res struct {
		Items []struct {
			VolumeInfo struct {
				Title         string   `json:"title"`
				Subtitle      string   `json:"subtitle"`
				Authors       []string `json:"authors"`
				Publisher     string   `json:"publisher"`
				PublishedDate string   `json:"publishedDate"`
				Language      string   `json:"language"`
				Categories    []string `json:"categories"`
			} `json:"volumeInfo"`
		} `json:"items"`
	}
	u := fmt.Sprintf("%s/books/v1/volumes?q=%s&maxResults=1", base, url.QueryEscape("isbn:"+isbn))
	if g.APIKey != "" {
		u += "&key=" + url.QueryEscape(g.APIKey)
	}
	if err := getJSON(ctx, g.Client, u, &res); err != nil {
		return Info{}, false, fmt.Errorf("google books: %w", err)
	}
	if len(res.Items) == 0 || strings.TrimSpace(res.Items[0].VolumeInfo.Title) == "" {
		return Info{}, false, nil
	}
	v := res.Items[0].VolumeInfo
	info := Info{
		Title:           v.Title,
		Author:          strings.Join(v.Authors, ", "),
		Publisher:       v.Publisher,
		PublicationYear: yearOf(v.PublishedDate),
		Language:        v.Language,
	}
	if v.Subtitle != "" {
		info.Title += ": " + v.Subtitle
	}
	if len(v.Categories) > 0 {
		info.Category = v.Categories[0]
	}
	return info, true, nil
}
