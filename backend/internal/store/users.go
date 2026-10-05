package store

import "context"

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name,omitempty"`
}

// UpsertUser provisions the user on first login and refreshes email/last-seen afterwards.
func (s *Store) UpsertUser(ctx context.Context, subject, email, name string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `
		INSERT INTO users (cf_subject, email, name)
		VALUES ($1, $2, NULLIF($3, ''))
		ON CONFLICT (cf_subject) DO UPDATE
		   SET email = EXCLUDED.email,
		       name = COALESCE(EXCLUDED.name, users.name),
		       last_seen_at = now()
		RETURNING id::text, email, COALESCE(name, '')`,
		subject, email, name).Scan(&u.ID, &u.Email, &u.Name)
	return u, err
}
