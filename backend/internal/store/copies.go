package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"libax/internal/catalogue"
)

var (
	ErrForbidden = errors.New("not allowed")
	ErrOnLoan    = errors.New("copy is on loan")
)

// Person is how another member of the library is shown (owner, borrower).
type Person struct {
	ID    string `json:"id"`
	Name  string `json:"name,omitempty"`
	Email string `json:"email"`
}

type Loan struct {
	ID         string    `json:"id"`
	Borrower   Person    `json:"borrower"`
	BorrowedAt time.Time `json:"borrowedAt"`
	DueAt      *string   `json:"dueAt,omitempty"`
}

// Copy is one physical copy of a catalogue book. Price is only filled in for its owner.
type Copy struct {
	ID           string         `json:"id"`
	Book         catalogue.Book `json:"book"`
	Owner        Person         `json:"owner"`
	Price        *float64       `json:"price,omitempty"`
	PurchaseDate *string        `json:"purchaseDate,omitempty"`
	Location     *string        `json:"location,omitempty"`
	CreatedAt    time.Time      `json:"createdAt"`
	Loan         *Loan          `json:"loan"`
}

// $1 is always the viewer: the price is hidden from everyone but the owner.
const copySelect = `
	SELECT c.id::text, c.book_id, b.title, b.author, COALESCE(b.isbn, ''), COALESCE(b.publisher, ''), b.publication_year,
	       b.language, b.category,
	       o.id::text, COALESCE(o.name, ''), o.email,
	       CASE WHEN c.owner_id = $1 THEN c.price::float8 END,
	       to_char(c.purchase_date, 'YYYY-MM-DD'), c.location, c.created_at,
	       l.id::text, bu.id::text, COALESCE(bu.name, ''), bu.email, l.borrowed_at, to_char(l.due_at, 'YYYY-MM-DD')
	  FROM copies c
	  JOIN books b ON b.id = c.book_id
	  JOIN users o ON o.id = c.owner_id
	  LEFT JOIN loans l ON l.copy_id = c.id AND l.returned_at IS NULL
	  LEFT JOIN users bu ON bu.id = l.borrower_id`

func scanCopy(row pgx.Row) (Copy, error) {
	var c Copy
	var loanID, borrowerID, borrowerName, borrowerEmail, due *string
	var borrowedAt *time.Time
	err := row.Scan(&c.ID, &c.Book.ID, &c.Book.Title, &c.Book.Author, &c.Book.ISBN, &c.Book.Publisher,
		&c.Book.PublicationYear, &c.Book.Language, &c.Book.Category,
		&c.Owner.ID, &c.Owner.Name, &c.Owner.Email,
		&c.Price, &c.PurchaseDate, &c.Location, &c.CreatedAt,
		&loanID, &borrowerID, &borrowerName, &borrowerEmail, &borrowedAt, &due)
	if err != nil {
		return c, err
	}
	if loanID != nil {
		c.Loan = &Loan{ID: *loanID, BorrowedAt: *borrowedAt, DueAt: due,
			Borrower: Person{ID: *borrowerID, Name: *borrowerName, Email: *borrowerEmail}}
	}
	return c, nil
}

func getCopy(ctx context.Context, q querier, viewerID, id string) (Copy, error) {
	c, err := scanCopy(q.QueryRow(ctx, copySelect+` WHERE c.id = $2`, viewerID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Copy{}, ErrNotFound
	}
	return c, err
}

func (s *Store) GetCopy(ctx context.Context, viewerID, id string) (Copy, error) {
	return getCopy(ctx, s.pool, viewerID, id)
}

// ListCopies returns every copy in the shared library with its current loan, if any.
func (s *Store) ListCopies(ctx context.Context, viewerID string) ([]Copy, error) {
	rows, err := s.pool.Query(ctx, copySelect+` ORDER BY b.title, c.created_at, c.id`, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Copy{}
	for rows.Next() {
		c, err := scanCopy(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) ListUsers(ctx context.Context) ([]Person, error) {
	rows, err := s.pool.Query(ctx, `SELECT id::text, COALESCE(name, ''), email FROM users ORDER BY lower(COALESCE(NULLIF(name, ''), email)), id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Person{}
	for rows.Next() {
		var p Person
		if err := rows.Scan(&p.ID, &p.Name, &p.Email); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// CreateCopy records that `ownerID` owns a copy of the book (which must be in the mirrored books table).
func (s *Store) CreateCopy(ctx context.Context, ownerID string, book catalogue.Book, in Copy) (Copy, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Copy{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, upsertBookSQL, book.ID, book.Title, book.Author, book.ISBN, book.Publisher,
		book.PublicationYear, book.Language, book.Category); err != nil {
		return Copy{}, err
	}
	var id string
	if err := tx.QueryRow(ctx,
		`INSERT INTO copies (book_id, owner_id, price, purchase_date, location) VALUES ($1, $2, $3, $4::date, $5) RETURNING id::text`,
		book.ID, ownerID, in.Price, in.PurchaseDate, in.Location).Scan(&id); err != nil {
		return Copy{}, err
	}
	out, err := getCopy(ctx, tx, ownerID, id)
	if err != nil {
		return Copy{}, err
	}
	return out, tx.Commit(ctx)
}

// lockCopy loads a copy's owner under a row lock so concurrent lend/return/edit calls are serialised.
func lockCopy(ctx context.Context, tx pgx.Tx, id string) (ownerID string, err error) {
	err = tx.QueryRow(ctx, `SELECT owner_id::text FROM copies WHERE id = $1 FOR UPDATE`, id).Scan(&ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return ownerID, err
}

// UpdateCopy lets the owner (only) change purchase details.
func (s *Store) UpdateCopy(ctx context.Context, userID, id string, fn func(*Copy) error) (Copy, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Copy{}, err
	}
	defer tx.Rollback(ctx)
	owner, err := lockCopy(ctx, tx, id)
	if err != nil {
		return Copy{}, err
	}
	if owner != userID {
		return Copy{}, ErrForbidden
	}
	c, err := getCopy(ctx, tx, userID, id)
	if err != nil {
		return Copy{}, err
	}
	if err := fn(&c); err != nil {
		return Copy{}, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE copies SET price = $2, purchase_date = $3::date, location = $4, updated_at = now() WHERE id = $1`,
		id, c.Price, c.PurchaseDate, c.Location); err != nil {
		return Copy{}, err
	}
	out, err := getCopy(ctx, tx, userID, id)
	if err != nil {
		return Copy{}, err
	}
	return out, tx.Commit(ctx)
}

// DeleteCopy removes the owner's copy; a copy that is currently lent out cannot be deleted.
func (s *Store) DeleteCopy(ctx context.Context, userID, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	owner, err := lockCopy(ctx, tx, id)
	if err != nil {
		return err
	}
	if owner != userID {
		return ErrForbidden
	}
	var out int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM loans WHERE copy_id = $1 AND returned_at IS NULL`, id).Scan(&out); err != nil {
		return err
	}
	if out > 0 {
		return ErrOnLoan
	}
	if _, err := tx.Exec(ctx, `DELETE FROM copies WHERE id = $1`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Lend starts a loan. Anyone may borrow for themselves; only the owner may lend to someone else. A copy
// cannot be borrowed by its own owner or while it is already out.
func (s *Store) Lend(ctx context.Context, actorID, copyID, borrowerID string, dueAt *string) (Copy, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Copy{}, err
	}
	defer tx.Rollback(ctx)
	owner, err := lockCopy(ctx, tx, copyID)
	if err != nil {
		return Copy{}, err
	}
	if borrowerID == "" {
		borrowerID = actorID
	}
	if borrowerID != actorID && actorID != owner {
		return Copy{}, ErrForbidden
	}
	if borrowerID == owner {
		return Copy{}, ErrOwnCopy
	}
	if _, err := tx.Exec(ctx, `INSERT INTO loans (copy_id, borrower_id, due_at) VALUES ($1, $2, $3::date)`, copyID, borrowerID, dueAt); err != nil {
		switch {
		case isUniqueViolation(err):
			return Copy{}, ErrOnLoan
		case isForeignKeyViolation(err):
			return Copy{}, ErrNotFound // unknown borrower
		}
		return Copy{}, err
	}
	out, err := getCopy(ctx, tx, actorID, copyID)
	if err != nil {
		return Copy{}, err
	}
	return out, tx.Commit(ctx)
}

// Return ends the active loan. Either the owner or the borrower may do it.
func (s *Store) Return(ctx context.Context, actorID, copyID string) (Copy, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Copy{}, err
	}
	defer tx.Rollback(ctx)
	owner, err := lockCopy(ctx, tx, copyID)
	if err != nil {
		return Copy{}, err
	}
	var borrower string
	err = tx.QueryRow(ctx, `SELECT borrower_id::text FROM loans WHERE copy_id = $1 AND returned_at IS NULL`, copyID).Scan(&borrower)
	if errors.Is(err, pgx.ErrNoRows) {
		return Copy{}, ErrNotOnLoan
	}
	if err != nil {
		return Copy{}, err
	}
	if actorID != owner && actorID != borrower {
		return Copy{}, ErrForbidden
	}
	if _, err := tx.Exec(ctx, `UPDATE loans SET returned_at = now() WHERE copy_id = $1 AND returned_at IS NULL`, copyID); err != nil {
		return Copy{}, err
	}
	out, err := getCopy(ctx, tx, actorID, copyID)
	if err != nil {
		return Copy{}, err
	}
	return out, tx.Commit(ctx)
}
