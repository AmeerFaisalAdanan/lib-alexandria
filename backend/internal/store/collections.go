package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type Collection struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	Color       string    `json:"color"`
	BookIDs     []string  `json:"bookIds"`
	CreatedAt   time.Time `json:"createdAt"`
}

const collectionSelect = `
	SELECT c.id::text, c.name, c.description, c.color, c.created_at,
	       COALESCE((SELECT array_agg(cb.book_id ORDER BY cb.added_at)
	                   FROM collection_books cb WHERE cb.collection_id = c.id), '{}')
	  FROM collections c
	 WHERE c.user_id = $1`

func scanCollection(row pgx.Row) (Collection, error) {
	var c Collection
	err := row.Scan(&c.ID, &c.Name, &c.Description, &c.Color, &c.CreatedAt, &c.BookIDs)
	if c.BookIDs == nil {
		c.BookIDs = []string{}
	}
	return c, err
}

func getCollection(ctx context.Context, q querier, userID, id string) (Collection, error) {
	c, err := scanCollection(q.QueryRow(ctx, collectionSelect+` AND c.id = $2`, userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Collection{}, ErrNotFound
	}
	return c, err
}

func (s *Store) ListCollections(ctx context.Context, userID string) ([]Collection, error) {
	rows, err := s.pool.Query(ctx, collectionSelect+` ORDER BY c.created_at, c.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Collection{}
	for rows.Next() {
		c, err := scanCollection(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) GetCollection(ctx context.Context, userID, id string) (Collection, error) {
	return getCollection(ctx, s.pool, userID, id)
}

func (s *Store) CreateCollection(ctx context.Context, userID string, c Collection) (Collection, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO collections (user_id, name, description, color) VALUES ($1, $2, $3, $4) RETURNING id::text`,
		userID, c.Name, c.Description, c.Color).Scan(&id)
	if err != nil {
		return Collection{}, err
	}
	return getCollection(ctx, s.pool, userID, id)
}

func (s *Store) UpdateCollection(ctx context.Context, userID, id string, fn func(*Collection) error) (Collection, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Collection{}, err
	}
	defer tx.Rollback(ctx)

	var locked int
	err = tx.QueryRow(ctx, `SELECT 1 FROM collections WHERE id = $2 AND user_id = $1 FOR UPDATE`, userID, id).Scan(&locked)
	if errors.Is(err, pgx.ErrNoRows) {
		return Collection{}, ErrNotFound
	}
	if err != nil {
		return Collection{}, err
	}
	c, err := getCollection(ctx, tx, userID, id)
	if err != nil {
		return Collection{}, err
	}
	if err := fn(&c); err != nil {
		return Collection{}, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE collections SET name = $3, description = $4, color = $5, updated_at = now() WHERE id = $2 AND user_id = $1`,
		userID, id, c.Name, c.Description, c.Color); err != nil {
		return Collection{}, err
	}
	out, err := getCollection(ctx, tx, userID, id)
	if err != nil {
		return Collection{}, err
	}
	return out, tx.Commit(ctx)
}

func (s *Store) DeleteCollection(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM collections WHERE id = $2 AND user_id = $1`, userID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// AddCollectionBook files a book the user already has into one of their collections (idempotent).
func (s *Store) AddCollectionBook(ctx context.Context, userID, collectionID, bookID string) (Collection, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Collection{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := getCollection(ctx, tx, userID, collectionID); err != nil {
		return Collection{}, err
	}
	var has int
	err = tx.QueryRow(ctx, `SELECT 1 FROM user_books WHERE user_id = $1 AND book_id = $2`, userID, bookID).Scan(&has)
	if errors.Is(err, pgx.ErrNoRows) {
		return Collection{}, ErrBookNotInLibrary
	}
	if err != nil {
		return Collection{}, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO collection_books (collection_id, user_id, book_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		collectionID, userID, bookID); err != nil {
		if isForeignKeyViolation(err) {
			return Collection{}, ErrBookNotInLibrary
		}
		return Collection{}, err
	}
	out, err := getCollection(ctx, tx, userID, collectionID)
	if err != nil {
		return Collection{}, err
	}
	return out, tx.Commit(ctx)
}

func (s *Store) RemoveCollectionBook(ctx context.Context, userID, collectionID, bookID string) (Collection, error) {
	if _, err := getCollection(ctx, s.pool, userID, collectionID); err != nil {
		return Collection{}, err
	}
	if _, err := s.pool.Exec(ctx,
		`DELETE FROM collection_books WHERE collection_id = $1 AND user_id = $2 AND book_id = $3`,
		collectionID, userID, bookID); err != nil {
		return Collection{}, err
	}
	return getCollection(ctx, s.pool, userID, collectionID)
}
