-- +goose Up
-- A copy is one physical book: who bought it, when, where it lives. Several users may own copies of the same book.
CREATE TABLE copies (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id       text NOT NULL REFERENCES books (id),
    owner_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    price         numeric(10, 2) CHECK (price >= 0),
    purchase_date date,
    location      text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX copies_book_idx ON copies (book_id);
CREATE INDEX copies_owner_idx ON copies (owner_id);

-- A loan lends a copy to a borrower. returned_at IS NULL means it is out right now.
CREATE TABLE loans (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    copy_id     uuid NOT NULL REFERENCES copies (id) ON DELETE CASCADE,
    borrower_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    borrowed_at timestamptz NOT NULL DEFAULT now(),
    due_at      date,
    returned_at timestamptz
);
CREATE INDEX loans_borrower_idx ON loans (borrower_id) WHERE returned_at IS NULL;
-- At most one active loan per copy, enforced by the database.
CREATE UNIQUE INDEX loans_one_active_per_copy ON loans (copy_id) WHERE returned_at IS NULL;

-- Purchase details used to be personal fields on the reading record; they belong to the copy now.
INSERT INTO copies (book_id, owner_id, price, purchase_date, location)
SELECT book_id, user_id, price, purchase_date, location
  FROM user_books
 WHERE price IS NOT NULL OR purchase_date IS NOT NULL OR location IS NOT NULL;

ALTER TABLE user_books DROP COLUMN price, DROP COLUMN purchase_date, DROP COLUMN location;

-- +goose Down
ALTER TABLE user_books ADD COLUMN price numeric(10, 2) CHECK (price >= 0), ADD COLUMN purchase_date date, ADD COLUMN location text;
DROP TABLE loans;
DROP TABLE copies;
