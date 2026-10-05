package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"libax/internal/catalogue"
)

// recordAudit writes an audit event inside the caller's transaction, so the change and its record commit together.
// metadata must never contain secrets; callers pass only identifiers, e-mails and before/after values.
func recordAudit(ctx context.Context, q querier, actorID *string, action, targetType, targetID string, metadata map[string]any) error {
	if metadata == nil {
		metadata = map[string]any{}
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx,
		`INSERT INTO audit_events (actor_user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)`,
		actorID, action, targetType, targetID, raw)
	return err
}

func (s *Store) ListMembers(ctx context.Context) ([]Member, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, COALESCE(name, ''), email, role, status, created_at, last_seen_at
		  FROM users
		 ORDER BY (role = 'admin') DESC, lower(COALESCE(NULLIF(name, ''), email)), id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Member{}
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.ID, &m.Name, &m.Email, &m.Role, &m.Status, &m.CreatedAt, &m.LastSeenAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// MemberChange is what an administrator may change about a member. nil means "leave as is".
type MemberChange struct {
	Role   *string
	Status *string
}

// UpdateMember changes a member's role and/or status. The actor id must come from the authenticated server
// identity. The final active administrator can be neither demoted nor disabled (ErrLastAdmin).
func (s *Store) UpdateMember(ctx context.Context, actorID, targetID string, ch MemberChange) (Member, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Member{}, err
	}
	defer tx.Rollback(ctx)

	// Lock the active administrators (in a fixed order) so two admins cannot each remove the other at once.
	rows, err := tx.Query(ctx, `SELECT id::text FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id FOR UPDATE`)
	if err != nil {
		return Member{}, err
	}
	activeAdmins := 0
	for rows.Next() {
		activeAdmins++
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return Member{}, err
	}

	var m Member
	err = tx.QueryRow(ctx, `
		SELECT id::text, COALESCE(name, ''), email, role, status, created_at, last_seen_at
		  FROM users WHERE id = $1 FOR UPDATE`, targetID).
		Scan(&m.ID, &m.Name, &m.Email, &m.Role, &m.Status, &m.CreatedAt, &m.LastSeenAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Member{}, ErrNotFound
	}
	if err != nil {
		return Member{}, err
	}

	newRole, newStatus := m.Role, m.Status
	if ch.Role != nil {
		newRole = *ch.Role
	}
	if ch.Status != nil {
		newStatus = *ch.Status
	}
	if newRole == m.Role && newStatus == m.Status {
		return m, nil // nothing to do, nothing to audit
	}

	wasActiveAdmin := m.Role == RoleAdmin && m.Status == StatusActive
	staysActiveAdmin := newRole == RoleAdmin && newStatus == StatusActive
	if wasActiveAdmin && !staysActiveAdmin && activeAdmins <= 1 {
		return Member{}, ErrLastAdmin
	}

	if _, err := tx.Exec(ctx, `UPDATE users SET role = $2, status = $3 WHERE id = $1`, targetID, newRole, newStatus); err != nil {
		return Member{}, err
	}
	meta := func(from, to string) map[string]any { return map[string]any{"email": m.Email, "from": from, "to": to} }
	if newRole != m.Role {
		action := "member.demoted"
		if newRole == RoleAdmin {
			action = "member.promoted"
		}
		if err := recordAudit(ctx, tx, &actorID, action, "member", targetID, meta(m.Role, newRole)); err != nil {
			return Member{}, err
		}
	}
	if newStatus != m.Status {
		action := "member.enabled"
		if newStatus == StatusDisabled {
			action = "member.disabled"
		}
		if err := recordAudit(ctx, tx, &actorID, action, "member", targetID, meta(m.Status, newStatus)); err != nil {
			return Member{}, err
		}
	}
	m.Role, m.Status = newRole, newStatus
	return m, tx.Commit(ctx)
}

// AuditEvent is one administrative action.
type AuditEvent struct {
	ID         string          `json:"id"`
	Actor      string          `json:"actor,omitempty"` // e-mail of the administrator, empty if the account is gone
	Action     string          `json:"action"`
	TargetType string          `json:"targetType"`
	TargetID   string          `json:"targetId"`
	Metadata   json.RawMessage `json:"metadata"`
	CreatedAt  time.Time       `json:"createdAt"`
}

func (s *Store) ListAudit(ctx context.Context, limit int) ([]AuditEvent, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT e.id::text, COALESCE(u.email, ''), e.action, e.target_type, e.target_id, e.metadata, e.created_at
		  FROM audit_events e LEFT JOIN users u ON u.id = e.actor_user_id
		 ORDER BY e.created_at DESC, e.id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AuditEvent{}
	for rows.Next() {
		var e AuditEvent
		if err := rows.Scan(&e.ID, &e.Actor, &e.Action, &e.TargetType, &e.TargetID, &e.Metadata, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- catalogue moderation

// HiddenBookIDs is the set of catalogue books administrators have hidden from members.
func (s *Store) HiddenBookIDs(ctx context.Context) (map[string]bool, error) {
	rows, err := s.pool.Query(ctx, `SELECT book_id FROM catalogue_hidden`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// SetBookHidden hides or restores a catalogue book (idempotent). Only an audit event records a real change.
func (s *Store) SetBookHidden(ctx context.Context, actorID string, book catalogue.Book, hidden bool) (changed bool, err error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, upsertBookSQL, book.ID, book.Title, book.Author, book.ISBN, book.Publisher,
		book.PublicationYear, book.Language, book.Category); err != nil {
		return false, err
	}
	var tag int64
	if hidden {
		t, err := tx.Exec(ctx, `INSERT INTO catalogue_hidden (book_id, hidden_by) VALUES ($1, $2) ON CONFLICT DO NOTHING`, book.ID, actorID)
		if err != nil {
			return false, err
		}
		tag = t.RowsAffected()
	} else {
		t, err := tx.Exec(ctx, `DELETE FROM catalogue_hidden WHERE book_id = $1`, book.ID)
		if err != nil {
			return false, err
		}
		tag = t.RowsAffected()
	}
	if tag > 0 {
		action := "catalogue.unhidden"
		if hidden {
			action = "catalogue.hidden"
		}
		if err := recordAudit(ctx, tx, &actorID, action, "book", book.ID, map[string]any{"title": book.Title}); err != nil {
			return false, err
		}
	}
	return tag > 0, tx.Commit(ctx)
}

// BookStats is what the library knows about a catalogue book beyond the sheet.
type BookStats struct {
	Readers     int
	Copies      int
	SubmittedBy string
}

func (s *Store) BookStats(ctx context.Context) (map[string]BookStats, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT b.id,
		       (SELECT count(*) FROM user_books ub WHERE ub.book_id = b.id),
		       (SELECT count(*) FROM copies c WHERE c.book_id = b.id),
		       COALESCE(u.email, '')
		  FROM books b
		  LEFT JOIN catalogue_submissions cs ON cs.book_id = b.id
		  LEFT JOIN users u ON u.id = cs.user_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]BookStats{}
	for rows.Next() {
		var id string
		var st BookStats
		if err := rows.Scan(&id, &st.Readers, &st.Copies, &st.SubmittedBy); err != nil {
			return nil, err
		}
		out[id] = st
	}
	return out, rows.Err()
}
