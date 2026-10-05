-- +goose Up
-- Roles and status live on the existing users table. Defaults keep every existing member a normal, active
-- member: nobody becomes an administrator by migration (see ADMIN_EMAILS for the explicit bootstrap).
ALTER TABLE users
    ADD COLUMN role   text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'));
CREATE INDEX users_active_admins_idx ON users (id) WHERE role = 'admin' AND status = 'active';

-- Administrative actions. The actor comes from the authenticated identity on the server, never from the client.
CREATE TABLE audit_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    action        text NOT NULL,
    target_type   text NOT NULL,
    target_id     text NOT NULL,
    metadata      jsonb NOT NULL DEFAULT '{}',
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);

-- Soft, reversible moderation: a hidden book disappears from the members' catalogue and cannot be newly added to a
-- library or recorded as a copy. The Google Sheet is never modified, and existing library entries stay.
CREATE TABLE catalogue_hidden (
    book_id   text PRIMARY KEY REFERENCES books (id),
    hidden_by uuid REFERENCES users (id) ON DELETE SET NULL,
    hidden_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE catalogue_hidden;
DROP TABLE audit_events;
DROP INDEX users_active_admins_idx;
ALTER TABLE users DROP COLUMN status, DROP COLUMN role;
