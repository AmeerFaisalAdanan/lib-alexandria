package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"libax/internal/catalogue"
)

// Entry is a user's relationship with a catalogue book (the "UserBook").
type Entry struct {
	BookID        string         `json:"bookId"`
	Book          catalogue.Book `json:"book"`
	Status        string         `json:"status"`
	Progress      int            `json:"progress"`
	Rating        *int           `json:"rating,omitempty"`
	Notes         string         `json:"notes"`
	Tags          []string       `json:"tags"`
	CollectionIDs []string       `json:"collectionIds"`
	AddedAt       time.Time      `json:"addedAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
}

const entrySelect = `
	SELECT ub.book_id, b.title, b.author, COALESCE(b.isbn, ''), COALESCE(b.publisher, ''), b.publication_year,
	       b.language, b.category,
	       ub.status, ub.progress, ub.rating, ub.notes, ub.tags,
	       COALESCE((SELECT array_agg(cb.collection_id::text ORDER BY cb.added_at)
	                   FROM collection_books cb
	                  WHERE cb.user_id = ub.user_id AND cb.book_id = ub.book_id), '{}'),
	       ub.added_at, ub.updated_at
	  FROM user_books ub
	  JOIN books b ON b.id = ub.book_id
	 WHERE ub.user_id = $1`

func scanEntry(row pgx.Row) (Entry, error) {
	var e Entry
	err := row.Scan(&e.BookID, &e.Book.Title, &e.Book.Author, &e.Book.ISBN, &e.Book.Publisher,
		&e.Book.PublicationYear, &e.Book.Language, &e.Book.Category,
		&e.Status, &e.Progress, &e.Rating, &e.Notes, &e.Tags,
		&e.CollectionIDs, &e.AddedAt, &e.UpdatedAt)
	e.Book.ID = e.BookID
	if e.Tags == nil {
		e.Tags = []string{}
	}
	if e.CollectionIDs == nil {
		e.CollectionIDs = []string{}
	}
	return e, err
}

func getEntry(ctx context.Context, q querier, userID, bookID string) (Entry, error) {
	e, err := scanEntry(q.QueryRow(ctx, entrySelect+` AND ub.book_id = $2`, userID, bookID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, ErrNotFound
	}
	return e, err
}

func (s *Store) GetEntry(ctx context.Context, userID, bookID string) (Entry, error) {
	return getEntry(ctx, s.pool, userID, bookID)
}

func (s *Store) ListEntries(ctx context.Context, userID string) ([]Entry, error) {
	rows, err := s.pool.Query(ctx, entrySelect+` ORDER BY ub.added_at DESC, ub.book_id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Entry{}
	for rows.Next() {
		e, err := scanEntry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// UpsertBooks mirrors the catalogue into the books table (idempotent).
func (s *Store) UpsertBooks(ctx context.Context, books []catalogue.Book) error {
	batch := &pgx.Batch{}
	for _, b := range books {
		batch.Queue(upsertBookSQL, b.ID, b.Title, b.Author, b.ISBN, b.Publisher, b.PublicationYear, b.Language, b.Category)
	}
	res := s.pool.SendBatch(ctx, batch)
	defer res.Close()
	for range books {
		if _, err := res.Exec(); err != nil {
			return err
		}
	}
	return nil
}

const upsertBookSQL = `
	INSERT INTO books (id, title, author, isbn, publisher, publication_year, language, category)
	VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6, $7, $8)
	ON CONFLICT (id) DO UPDATE
	   SET title = EXCLUDED.title, author = EXCLUDED.author, isbn = EXCLUDED.isbn,
	       publisher = EXCLUDED.publisher, publication_year = EXCLUDED.publication_year,
	       language = EXCLUDED.language, category = EXCLUDED.category, synced_at = now()`

// AddEntry adds a catalogue book to the user's library. A second add for the same book is ErrConflict.
func (s *Store) AddEntry(ctx context.Context, userID string, book catalogue.Book, e Entry) (Entry, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Entry{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, upsertBookSQL, book.ID, book.Title, book.Author, book.ISBN, book.Publisher,
		book.PublicationYear, book.Language, book.Category); err != nil {
		return Entry{}, err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO user_books (user_id, book_id, status, progress, rating, notes, tags)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		userID, book.ID, e.Status, e.Progress, e.Rating, e.Notes, e.Tags)
	if err != nil {
		if isUniqueViolation(err) {
			return Entry{}, ErrConflict
		}
		return Entry{}, err
	}
	out, err := getEntry(ctx, tx, userID, book.ID)
	if err != nil {
		return Entry{}, err
	}
	return out, tx.Commit(ctx)
}

// UpdateEntry loads the row under a lock, lets fn modify it (fn may return a validation error), and saves.
func (s *Store) UpdateEntry(ctx context.Context, userID, bookID string, fn func(*Entry) error) (Entry, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Entry{}, err
	}
	defer tx.Rollback(ctx)

	var locked int
	err = tx.QueryRow(ctx, `SELECT 1 FROM user_books WHERE user_id = $1 AND book_id = $2 FOR UPDATE`,
		userID, bookID).Scan(&locked)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, ErrNotFound
	}
	if err != nil {
		return Entry{}, err
	}

	e, err := getEntry(ctx, tx, userID, bookID)
	if err != nil {
		return Entry{}, err
	}
	if err := fn(&e); err != nil {
		return Entry{}, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE user_books
		   SET status = $3, progress = $4, rating = $5, notes = $6, tags = $7, updated_at = now()
		 WHERE user_id = $1 AND book_id = $2`,
		userID, bookID, e.Status, e.Progress, e.Rating, e.Notes, e.Tags); err != nil {
		return Entry{}, err
	}
	out, err := getEntry(ctx, tx, userID, bookID)
	if err != nil {
		return Entry{}, err
	}
	return out, tx.Commit(ctx)
}

// DeleteEntry removes the book from the user's library (and from their collections, by cascade).
func (s *Store) DeleteEntry(ctx context.Context, userID, bookID string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM user_books WHERE user_id = $1 AND book_id = $2`, userID, bookID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
