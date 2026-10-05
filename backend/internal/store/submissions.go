package store

import (
	"context"
	"time"

	"libax/internal/catalogue"
)

// CountSubmissions is how many catalogue books the user published since `since`.
func (s *Store) CountSubmissions(ctx context.Context, userID string, since time.Time) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM catalogue_submissions WHERE user_id = $1 AND created_at >= $2`, userID, since).Scan(&n)
	return n, err
}

// RecordSubmission notes who published a book (and makes sure the mirrored books row exists).
func (s *Store) RecordSubmission(ctx context.Context, userID string, b catalogue.Book) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, upsertBookSQL, b.ID, b.Title, b.Author, b.ISBN, b.Publisher, b.PublicationYear, b.Language, b.Category); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO catalogue_submissions (book_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, b.ID, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
