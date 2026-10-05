-- +goose Up
-- Who published which catalogue book (audit trail + per-user rate limit).
CREATE TABLE catalogue_submissions (
    book_id    text PRIMARY KEY REFERENCES books (id),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalogue_submissions_user_idx ON catalogue_submissions (user_id, created_at DESC);

-- +goose Down
DROP TABLE catalogue_submissions;
