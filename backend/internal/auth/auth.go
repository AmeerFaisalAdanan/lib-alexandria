// Package auth turns an incoming request into a local user. The identity always comes from the server-side
// authenticator; nothing the browser sends in a body or query string is ever used to pick the user.
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
)

var ErrUnauthenticated = errors.New("unauthenticated")

// Identity is who the upstream authenticator says is calling.
type Identity struct {
	Subject string // stable unique id (Cloudflare "sub")
	Email   string
	Name    string
}

type Authenticator interface {
	Authenticate(r *http.Request) (Identity, error)
}

// User is the local account an Identity maps to.
type User struct {
	ID    string
	Email string
	Name  string
}

type ctxKey struct{}

func WithUser(ctx context.Context, u User) context.Context {
	return context.WithValue(ctx, ctxKey{}, u)
}

func UserFrom(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(ctxKey{}).(User)
	return u, ok
}

// Middleware authenticates the request and provisions the local user on first sight.
func Middleware(a Authenticator, provision func(context.Context, Identity) (User, error), log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, err := a.Authenticate(r)
			if err != nil {
				// Never log the token or header values, only the reason class.
				log.Info("authentication failed", "path", r.URL.Path, "reason", err.Error())
				writeUnauthorized(w)
				return
			}
			u, err := provision(r.Context(), id)
			if err != nil {
				log.Error("user provisioning failed", "error", err)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"code": "internal", "message": "internal error"}})
				return
			}
			next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), u)))
		})
	}
}

func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"code": "unauthorized", "message": "authentication required"}})
}
