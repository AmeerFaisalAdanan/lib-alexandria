// Package catalogue is the shared, read-only book catalogue. The rest of the app only sees Repository;
// where the rows come from (Google Sheets, a fixture file) is an implementation detail.
package catalogue

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"time"
)

// ErrReadOnly means the catalogue source cannot accept new books.
var ErrReadOnly = errors.New("catalogue is read-only")

type Book struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	Author          string `json:"author"`
	ISBN            string `json:"isbn,omitempty"`
	Publisher       string `json:"publisher,omitempty"`
	PublicationYear *int   `json:"publicationYear,omitempty"`
	Language        string `json:"language"`
	Category        string `json:"category"`
}

type Repository interface {
	ListBooks(ctx context.Context) ([]Book, error)
	GetBook(ctx context.Context, id string) (Book, bool, error)
}

// Source fetches the full catalogue from its backing store.
type Source interface {
	Fetch(ctx context.Context) ([]Book, error)
}

// Appender is implemented by sources that can store a new book (and record who added it).
type Appender interface {
	Append(ctx context.Context, b Book, addedBy string) error
}

// Publisher adds a book to the shared catalogue.
type Publisher interface {
	Publish(ctx context.Context, b Book, addedBy string) error
}

// Cache serves a Source from memory and refreshes it after TTL. If a refresh fails it keeps serving
// the last good copy, so a Sheets outage does not take the app down.
type Cache struct {
	src       Source
	ttl       time.Duration
	log       *slog.Logger
	onRefresh func(context.Context, []Book) error

	mu        sync.Mutex
	books     []Book
	byID      map[string]Book
	fetchedAt time.Time
	now       func() time.Time
}

// NewCache wraps src. onRefresh (optional) runs after each successful fetch, e.g. to mirror into the DB.
func NewCache(src Source, ttl time.Duration, log *slog.Logger, onRefresh func(context.Context, []Book) error) *Cache {
	return &Cache{src: src, ttl: ttl, log: log, onRefresh: onRefresh, now: time.Now}
}

func (c *Cache) snapshot(ctx context.Context) ([]Book, map[string]Book, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.snapshotLocked(ctx)
}

func (c *Cache) snapshotLocked(ctx context.Context) ([]Book, map[string]Book, error) {
	if c.books != nil && c.now().Sub(c.fetchedAt) < c.ttl {
		return c.books, c.byID, nil
	}

	books, err := c.src.Fetch(ctx)
	if err != nil {
		if c.books != nil {
			c.log.Warn("catalogue refresh failed, serving stale copy", "error", err)
			c.fetchedAt = c.now().Add(-c.ttl + 30*time.Second) // retry in 30s rather than on every request
			return c.books, c.byID, nil
		}
		return nil, nil, err
	}

	byID := make(map[string]Book, len(books))
	for _, b := range books {
		byID[b.ID] = b
	}
	c.books, c.byID, c.fetchedAt = books, byID, c.now()

	if c.onRefresh != nil {
		if err := c.onRefresh(ctx, books); err != nil {
			c.log.Error("catalogue mirror failed", "error", err)
		}
	}
	return c.books, c.byID, nil
}

func (c *Cache) ListBooks(ctx context.Context) ([]Book, error) {
	books, _, err := c.snapshot(ctx)
	return books, err
}

func (c *Cache) GetBook(ctx context.Context, id string) (Book, bool, error) {
	_, byID, err := c.snapshot(ctx)
	if err != nil {
		return Book{}, false, err
	}
	b, ok := byID[id]
	return b, ok, nil
}

// Publish stores a new book in the source and makes it visible immediately (no waiting for the TTL).
func (c *Cache) Publish(ctx context.Context, b Book, addedBy string) error {
	app, ok := c.src.(Appender)
	if !ok {
		return ErrReadOnly
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, _, err := c.snapshotLocked(ctx); err != nil { // never append on top of a catalogue we could not read
		return err
	}
	if err := app.Append(ctx, b, addedBy); err != nil {
		return err
	}
	c.books = append(append(make([]Book, 0, len(c.books)+1), c.books...), b)
	c.byID[b.ID] = b
	if c.onRefresh != nil {
		if err := c.onRefresh(ctx, []Book{b}); err != nil {
			c.log.Error("catalogue mirror failed", "error", err)
		}
	}
	return nil
}

// NormaliseISBN strips separators and upper-cases a trailing X.
func NormaliseISBN(raw string) string {
	return strings.ToUpper(strings.NewReplacer("-", "", " ", "").Replace(strings.TrimSpace(raw)))
}

// TitleAuthorKey identifies a book by its title and author, ignoring case and spacing (for duplicate detection).
func TitleAuthorKey(b Book) string { return fold(b.Title) + "|" + fold(b.Author) }

func fold(s string) string { return strings.ToLower(strings.Join(strings.Fields(s), " ")) }

// FindDuplicate returns an existing book with the same ISBN, or the same title and author.
func FindDuplicate(books []Book, candidate Book) (Book, bool) {
	isbn := NormaliseISBN(candidate.ISBN)
	title, author := fold(candidate.Title), fold(candidate.Author)
	for _, b := range books {
		if isbn != "" && NormaliseISBN(b.ISBN) == isbn {
			return b, true
		}
		if fold(b.Title) == title && fold(b.Author) == author {
			return b, true
		}
	}
	return Book{}, false
}
