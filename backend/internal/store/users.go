package store

import (
	"context"
	"strings"
	"time"
)

const (
	RoleMember = "member"
	RoleAdmin  = "admin"

	StatusActive   = "active"
	StatusDisabled = "disabled"
)

type User struct {
	ID     string `json:"id"`
	Email  string `json:"email"`
	Name   string `json:"name,omitempty"`
	Role   string `json:"role"`
	Status string `json:"status"`
}

// bootstrapAdminLock serialises bootstrap promotions so two allow-listed logins at once cannot both win.
const bootstrapAdminLock = 7301

// UpsertUser provisions the user on first login and refreshes email/last-seen afterwards. It never changes an
// existing role or status, except through the explicit bootstrap below, so a disabled member who logs in again
// stays disabled.
func (s *Store) UpsertUser(ctx context.Context, subject, email, name string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `
		INSERT INTO users (cf_subject, email, name)
		VALUES ($1, $2, NULLIF($3, ''))
		ON CONFLICT (cf_subject) DO UPDATE
		   SET email = EXCLUDED.email,
		       name = COALESCE(EXCLUDED.name, users.name),
		       last_seen_at = now()
		RETURNING id::text, email, COALESCE(name, ''), role, status`,
		subject, email, name).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.Status)
	if err != nil {
		return u, err
	}
	if s.isBootstrapAdmin(u.Email) && (u.Role != RoleAdmin || u.Status != StatusActive) {
		return s.bootstrapAdmin(ctx, u)
	}
	return u, nil
}

func (s *Store) isBootstrapAdmin(email string) bool {
	for _, e := range s.BootstrapAdmins {
		if strings.EqualFold(e, email) {
			return true
		}
	}
	return false
}

// bootstrapAdmin promotes an allow-listed identity, but only while the database has NO active administrator.
// That makes ADMIN_EMAILS an initial-setup and break-glass mechanism, not a standing override: once an admin
// exists, roles come from the database and demoting someone sticks.
func (s *Store) bootstrapAdmin(ctx context.Context, u User) (User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return u, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, bootstrapAdminLock); err != nil {
		return u, err
	}
	var admins int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM users WHERE role = 'admin' AND status = 'active'`).Scan(&admins); err != nil {
		return u, err
	}
	if admins > 0 {
		return u, nil
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET role = 'admin', status = 'active' WHERE id = $1`, u.ID); err != nil {
		return u, err
	}
	if err := recordAudit(ctx, tx, &u.ID, "admin.bootstrapped", "member", u.ID,
		map[string]any{"email": u.Email, "fromRole": u.Role, "fromStatus": u.Status}); err != nil {
		return u, err
	}
	u.Role, u.Status = RoleAdmin, StatusActive
	return u, tx.Commit(ctx)
}

// Member is a user as seen by administrators.
type Member struct {
	ID         string    `json:"id"`
	Name       string    `json:"name,omitempty"`
	Email      string    `json:"email"`
	Role       string    `json:"role"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"createdAt"`
	LastSeenAt time.Time `json:"lastSeenAt"`
}
