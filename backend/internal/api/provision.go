package api

import (
	"context"

	"libax/internal/auth"
	"libax/internal/store"
)

// Provisioner maps an authenticated identity to a local member (creating it on first login). The role and status
// it returns come from the database on every request.
func Provisioner(db *store.Store) func(context.Context, auth.Identity) (auth.User, error) {
	return func(ctx context.Context, id auth.Identity) (auth.User, error) {
		u, err := db.UpsertUser(ctx, id.Subject, id.Email, id.Name)
		return auth.User{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role, Status: u.Status}, err
	}
}
