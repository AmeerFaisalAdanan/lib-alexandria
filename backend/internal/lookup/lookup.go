// Package lookup fills in book details from an ISBN (Open Library, Google Books) or from a photo of the
// cover (a Claude vision model). Results are suggestions for a form the user reviews, never written
// anywhere automatically.
package lookup

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

// Info is what a lookup could work out about a book. Every field is optional except that a useful
// result has at least a Title.
type Info struct {
	Title           string `json:"title"`
	Author          string `json:"author"`
	Publisher       string `json:"publisher,omitempty"`
	ISBN            string `json:"isbn,omitempty"`
	PublicationYear *int   `json:"publicationYear,omitempty"`
	Language        string `json:"language,omitempty"` // "English", "Bahasa Melayu", or empty when unknown
	Category        string `json:"category,omitempty"`
}

// ISBNLookup finds a book by ISBN. found=false with a nil error means nobody knows the ISBN.
type ISBNLookup interface {
	ByISBN(ctx context.Context, isbn string) (info Info, found bool, err error)
}

// CoverReader reads the details printed on a photo of a book cover.
type CoverReader interface {
	Read(ctx context.Context, image []byte, mediaType string) (Info, error)
}

// ErrUnreadable means the image did not contain a recognisable book.
var ErrUnreadable = errors.New("no book details could be read from the image")

func clean(s string, max int) string {
	var b strings.Builder
	for _, r := range s {
		if r < 0x20 || r == 0x7f {
			r = ' '
		}
		b.WriteRune(r)
	}
	v := strings.Join(strings.Fields(b.String()), " ")
	if utf8.RuneCountInString(v) > max {
		v = string([]rune(v)[:max])
	}
	return v
}

// Clean makes untrusted text (from the web or from a cover) safe to put in a form: no control characters,
// bounded lengths, a plausible year, and an ISBN that is either valid or empty.
func (i Info) Clean(now time.Time) Info {
	out := Info{
		Title:     clean(i.Title, 300),
		Author:    clean(i.Author, 300),
		Publisher: clean(i.Publisher, 200),
		Category:  clean(i.Category, 80),
		Language:  NormaliseLanguage(clean(i.Language, 50)),
	}
	if isbn := NormaliseISBN(i.ISBN); Valid(isbn) {
		out.ISBN = To13(isbn)
	}
	if y := i.PublicationYear; y != nil && *y >= 1000 && *y <= now.Year()+1 {
		out.PublicationYear = y
	}
	return out
}

// Fill copies fields from `other` into any field that is still empty here.
func (i Info) Fill(other Info) Info {
	if i.Title == "" {
		i.Title = other.Title
	}
	if i.Author == "" {
		i.Author = other.Author
	}
	if i.Publisher == "" {
		i.Publisher = other.Publisher
	}
	if i.ISBN == "" {
		i.ISBN = other.ISBN
	}
	if i.PublicationYear == nil {
		i.PublicationYear = other.PublicationYear
	}
	if i.Language == "" {
		i.Language = other.Language
	}
	if i.Category == "" {
		i.Category = other.Category
	}
	return i
}

// NormaliseLanguage maps language names and codes to the two labels the app translates; anything else is
// reported as unknown (empty) so the form keeps its own default.
func NormaliseLanguage(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "english", "en", "eng":
		return "English"
	case "bahasa melayu", "bahasa malaysia", "malay", "bm", "ms", "may", "msa", "melayu":
		return "Bahasa Melayu"
	}
	return ""
}
