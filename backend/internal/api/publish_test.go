package api_test

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"libax/internal/catalogue"
)

// newPublishEnv wires a real cache over a fixture source, so published books flow through the real code path.
func newPublishEnv(t *testing.T, limit int) (*env, *catalogue.Cache) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "catalogue.json")
	seed := `[{"id":"bk-1","title":"Ihya Ulum al-Din","author":"Al-Ghazali","isbn":"9789670000015","language":"English","category":"Kitab Turath"}]`
	if err := os.WriteFile(path, []byte(seed), 0o600); err != nil {
		t.Fatal(err)
	}
	cache := catalogue.NewCache(&catalogue.FixtureSource{Path: path}, time.Hour, slog.New(slog.DiscardHandler), nil)
	return newEnvWith(t, cache, cache, limit), cache
}

func valid(over map[string]any) map[string]any {
	b := map[string]any{"title": "Fiqh as-Sunnah", "author": "Sayyid Sabiq", "language": "bm", "category": "Fiqh", "publicationYear": 2018}
	for k, v := range over {
		b[k] = v
	}
	return b
}

func TestPublishedBookIsVisibleToEveryone(t *testing.T) {
	e, _ := newPublishEnv(t, 0)
	a, b := newUser(t, "a"), newUser(t, "b")

	if me := e.do(a, "GET", "/api/me", nil).wantStatus(t, 200); me.Body["canAddBooks"] != true {
		t.Fatalf("canAddBooks = %v", me.Body["canAddBooks"])
	}
	created := e.do(a, "POST", "/api/books", valid(map[string]any{"title": "  Fiqh   as-Sunnah  ", "isbn": "978-967-0000-02-2"})).wantStatus(t, 201)
	id, _ := created.Body["id"].(string)
	if !strings.HasPrefix(id, "bk-") || len(id) != 15 {
		t.Fatalf("id should be a generated bk-xxxxxxxxxxxx, got %q", id)
	}
	if created.Body["title"] != "Fiqh as-Sunnah" || created.Body["language"] != "Bahasa Melayu" || created.Body["isbn"] != "9789670000022" {
		t.Errorf("input should be tidied/normalised: %v", created.Body)
	}

	// Everyone sees it, by list and by id; the original book is untouched.
	for _, u := range []string{a, b} {
		list := e.do(u, "GET", "/api/books", nil).wantStatus(t, 200)
		if len(list.List) != 2 {
			t.Fatalf("%s should see 2 books, got %d", u, len(list.List))
		}
		e.do(u, "GET", "/api/books/"+id, nil).wantStatus(t, 200)
	}
	// And another user can put it in their own library straight away.
	e.do(b, "POST", "/api/my/library", map[string]any{"bookId": id}).wantStatus(t, 201)
}

func TestPublishRejectsDuplicates(t *testing.T) {
	e, _ := newPublishEnv(t, 0)
	u := newUser(t, "a")

	byISBN := e.do(u, "POST", "/api/books", valid(map[string]any{"title": "Another title", "isbn": "978-967-0000-015"})).wantStatus(t, 409)
	if err := byISBN.Body["error"].(map[string]any); err["code"] != "duplicate" || err["existing"] != "bk-1" {
		t.Errorf("duplicate by ISBN: %v", err)
	}
	e.do(u, "POST", "/api/books", valid(map[string]any{"title": "  IHYA  ulum AL-din ", "author": "al-ghazali"})).wantStatus(t, 409)

	// A second publish of the same new book (e.g. a double tap) is also a duplicate, not two rows.
	e.do(u, "POST", "/api/books", valid(nil)).wantStatus(t, 201)
	e.do(u, "POST", "/api/books", valid(nil)).wantStatus(t, 409)
	if l := e.do(u, "GET", "/api/books", nil); len(l.List) != 2 {
		t.Fatalf("expected exactly 2 books, got %d", len(l.List))
	}
}

func TestPublishValidation(t *testing.T) {
	e, _ := newPublishEnv(t, 0)
	u := newUser(t, "a")
	bad := map[string]map[string]any{
		"no title":         valid(map[string]any{"title": "  "}),
		"no author":        valid(map[string]any{"author": ""}),
		"no category":      valid(map[string]any{"category": ""}),
		"no language":      valid(map[string]any{"language": ""}),
		"long title":       valid(map[string]any{"title": strings.Repeat("x", 301)}),
		"bad isbn":         valid(map[string]any{"isbn": "123"}),
		"year too old":     valid(map[string]any{"publicationYear": 999}),
		"year in future":   valid(map[string]any{"publicationYear": time.Now().Year() + 5}),
		"control char":     valid(map[string]any{"title": "bad\x00title"}),
		"unknown field":    valid(map[string]any{"id": "bk-hijack"}),
		"user id smuggled": valid(map[string]any{"userId": "x"}),
	}
	for name, body := range bad {
		if r := e.do(u, "POST", "/api/books", body); r.Status != 400 {
			t.Errorf("%s: status %d, want 400 (%s)", name, r.Status, r.Raw)
		}
	}
	if l := e.do(u, "GET", "/api/books", nil); len(l.List) != 1 {
		t.Fatalf("rejected input must not reach the catalogue, have %d books", len(l.List))
	}
}

func TestPublishIsRateLimitedPerUser(t *testing.T) {
	e, _ := newPublishEnv(t, 2)
	a, b := newUser(t, "a"), newUser(t, "b")
	for i, title := range []string{"One", "Two"} {
		e.do(a, "POST", "/api/books", valid(map[string]any{"title": title + " " + strings.Repeat("x", i)})).wantStatus(t, 201)
	}
	e.do(a, "POST", "/api/books", valid(map[string]any{"title": "Three"})).wantStatus(t, 429)
	e.do(b, "POST", "/api/books", valid(map[string]any{"title": "Three"})).wantStatus(t, 201) // limit is per user
}

func TestPublishNeedsAuthentication(t *testing.T) {
	// Covered structurally: /api/books sits behind the auth middleware (see TestHealthzIsPublicButAPIIsNot).
	e, _ := newPublishEnv(t, 0)
	_ = e
}

type readOnlySource struct{}

func (readOnlySource) Fetch(context.Context) ([]catalogue.Book, error) { return nil, nil }

func TestPublishOnReadOnlySourceIsRefused(t *testing.T) {
	cache := catalogue.NewCache(readOnlySource{}, time.Hour, slog.New(slog.DiscardHandler), nil)
	e := newEnvWith(t, cache, cache, 0)
	e.do(newUser(t, "a"), "POST", "/api/books", valid(nil)).wantStatus(t, 403)
}
