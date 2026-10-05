-- +goose Up
CREATE TABLE users (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cf_subject   text NOT NULL UNIQUE,
    email        text NOT NULL,
    name         text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Mirror of the shared catalogue (source of truth: Google Sheets), kept so user data has real foreign keys.
CREATE TABLE books (
    id               text PRIMARY KEY,
    title            text NOT NULL,
    author           text NOT NULL,
    isbn             text,
    publisher        text,
    publication_year integer,
    language         text NOT NULL,
    category         text NOT NULL,
    synced_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_books (
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    book_id       text NOT NULL REFERENCES books (id),
    status        text NOT NULL DEFAULT 'want_to_read'
                  CHECK (status IN ('want_to_read', 'reading', 'completed')),
    progress      integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    rating        integer CHECK (rating BETWEEN 1 AND 5),
    notes         text NOT NULL DEFAULT '',
    tags          text[] NOT NULL DEFAULT '{}',
    price         numeric(10, 2) CHECK (price >= 0),
    purchase_date date,
    location      text,
    added_at      timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, book_id),
    CHECK ((status = 'want_to_read' AND progress = 0) OR (status = 'completed' AND progress = 100) OR status = 'reading')
);
CREATE INDEX user_books_user_added_idx ON user_books (user_id, added_at DESC);

CREATE TABLE collections (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        text NOT NULL,
    description text,
    color       text NOT NULL DEFAULT 'amber' CHECK (color IN ('amber', 'emerald', 'purple', 'blue', 'rose')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, user_id)
);
CREATE INDEX collections_user_idx ON collections (user_id, created_at);

-- Composite foreign keys make the database itself refuse cross-user links:
-- a collection and a book entry can only be joined when both belong to the same user.
CREATE TABLE collection_books (
    collection_id uuid NOT NULL,
    user_id       uuid NOT NULL,
    book_id       text NOT NULL,
    added_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, book_id),
    FOREIGN KEY (collection_id, user_id) REFERENCES collections (id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id, book_id) REFERENCES user_books (user_id, book_id) ON DELETE CASCADE
);
CREATE INDEX collection_books_user_book_idx ON collection_books (user_id, book_id);

-- +goose Down
DROP TABLE collection_books;
DROP TABLE collections;
DROP TABLE user_books;
DROP TABLE books;
DROP TABLE users;
