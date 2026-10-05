package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5"

	"libax/internal/api"
	"libax/internal/auth"
	"libax/internal/catalogue"
	"libax/internal/store"
)

var (
	testDBURL string
	seq       atomic.Int64
)

// These tests need a real PostgreSQL (TEST_DATABASE_URL). They fail loudly rather than skip, because
// the isolation tests must never be silently absent.
func TestMain(m *testing.M) {
	testDBURL = os.Getenv("TEST_DATABASE_URL")
	if testDBURL == "" {
		fmt.Fprintln(os.Stderr, "TEST_DATABASE_URL is required (see scripts/test-backend.sh)")
		os.Exit(1)
	}
	if err := store.Migrate(context.Background(), testDBURL); err != nil {
		fmt.Fprintln(os.Stderr, "migrate:", err)
		os.Exit(1)
	}
	os.Exit(m.Run())
}

type staticCatalogue []catalogue.Book

func (c staticCatalogue) ListBooks(context.Context) ([]catalogue.Book, error) { return c, nil }
func (c staticCatalogue) GetBook(_ context.Context, id string) (catalogue.Book, bool, error) {
	for _, b := range c {
		if b.ID == id {
			return b, true, nil
		}
	}
	return catalogue.Book{}, false, nil
}

var books = staticCatalogue{
	{ID: "bk-1", Title: "Ihya Ulum al-Din", Author: "Al-Ghazali", Language: "English", Category: "Kitab Turath"},
	{ID: "bk-2", Title: "Riyadus Salihin", Author: "An-Nawawi", Language: "Bahasa Melayu", Category: "Hadith"},
	{ID: "bk-3", Title: "The Pragmatic Programmer", Author: "Hunt & Thomas", Language: "English", Category: "Technology"},
}

type env struct {
	t   *testing.T
	srv *httptest.Server
	db  *store.Store
}

func newEnv(t *testing.T) *env { return newEnvWith(t, books, nil, 0) }

// newEnvWith wires a router with a custom catalogue and (optionally) a publisher.
func newEnvWith(t *testing.T, cat catalogue.Repository, pub catalogue.Publisher, limit int, opts ...func(*api.Deps)) *env {
	t.Helper()
	db, err := store.Open(context.Background(), testDBURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	if err := db.UpsertBooks(context.Background(), books); err != nil {
		t.Fatal(err)
	}
	if limit == 0 {
		limit = 20
	}
	dev, _ := auth.NewDev("test", "")
	log := slog.New(slog.DiscardHandler)
	provision := func(ctx context.Context, id auth.Identity) (auth.User, error) {
		u, err := db.UpsertUser(ctx, id.Subject, id.Email, id.Name)
		return auth.User{ID: u.ID, Email: u.Email, Name: u.Name}, err
	}
	deps := api.Deps{
		Store: db, Catalogue: cat, Log: log, Auth: auth.Middleware(dev, provision, log), AuthMode: "dev",
		Publisher: pub, SubmissionLimit: limit,
	}
	for _, o := range opts {
		o(&deps)
	}
	srv := httptest.NewServer(api.NewRouter(deps))
	t.Cleanup(srv.Close)
	return &env{t: t, srv: srv, db: db}
}

// newUser returns a unique email, so tests never collide with rows from other tests or earlier runs.
func newUser(t *testing.T, label string) string {
	return fmt.Sprintf("%s-%d@test.example", label, seq.Add(1)) + "." + strings.ReplaceAll(t.Name(), "/", "_")
}

type resp struct {
	Status int
	Body   map[string]any
	List   []map[string]any
	Raw    string
}

func (e *env) do(user, method, path string, body any) resp {
	e.t.Helper()
	var rd io.Reader
	switch b := body.(type) {
	case nil:
	case string:
		rd = strings.NewReader(b)
	default:
		raw, _ := json.Marshal(b)
		rd = bytes.NewReader(raw)
	}
	req, _ := http.NewRequest(method, e.srv.URL+path, rd)
	if user != "" {
		req.Header.Set("X-Dev-User", user)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	out := resp{Status: res.StatusCode, Raw: string(raw)}
	_ = json.Unmarshal(raw, &out.Body)
	_ = json.Unmarshal(raw, &out.List)
	return out
}

func (r resp) wantStatus(t *testing.T, want int) resp {
	t.Helper()
	if r.Status != want {
		t.Fatalf("status = %d, want %d; body: %s", r.Status, want, r.Raw)
	}
	return r
}

// ---------------------------------------------------------------- identity + catalogue

func TestMeProvisionsUserOnFirstRequest(t *testing.T) {
	e := newEnv(t)
	u := newUser(t, "ada")
	first := e.do(u, "GET", "/api/me", nil).wantStatus(t, 200)
	second := e.do(u, "GET", "/api/me", nil).wantStatus(t, 200)
	if first.Body["id"] == "" || first.Body["id"] != second.Body["id"] {
		t.Fatalf("same identity must map to the same local user: %v vs %v", first.Body, second.Body)
	}
	if first.Body["email"] != strings.ToLower(u) {
		t.Errorf("email = %v", first.Body["email"])
	}
	if first.Body["authMode"] != "dev" {
		t.Errorf("authMode = %v", first.Body["authMode"])
	}
	other := e.do(newUser(t, "bob"), "GET", "/api/me", nil).wantStatus(t, 200)
	if other.Body["id"] == first.Body["id"] {
		t.Fatal("different identities must be different users")
	}
}

func TestHealthzIsPublicButAPIIsNot(t *testing.T) {
	e := newEnv(t)
	e.do("", "GET", "/healthz", nil).wantStatus(t, 200)

	// A router wired to a real Cloudflare authenticator must reject anonymous API calls.
	db, _ := store.Open(context.Background(), testDBURL)
	defer db.Close()
	log := slog.New(slog.DiscardHandler)
	cf := auth.NewCloudflare("https://example.cloudflareaccess.com", "aud", nil)
	srv := httptest.NewServer(api.NewRouter(api.Deps{
		Store: db, Catalogue: books, Log: log,
		Auth: auth.Middleware(cf, func(context.Context, auth.Identity) (auth.User, error) { return auth.User{}, nil }, log),
	}))
	defer srv.Close()
	for _, p := range []string{"/api/me", "/api/books", "/api/my/library", "/api/collections"} {
		res, err := http.Get(srv.URL + p)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 401 {
			t.Errorf("%s without a token: status %d, want 401", p, res.StatusCode)
		}
	}
}

func TestCatalogueLookup(t *testing.T) {
	e := newEnv(t)
	u := newUser(t, "ada")
	list := e.do(u, "GET", "/api/books", nil).wantStatus(t, 200)
	if len(list.List) != len(books) {
		t.Fatalf("want %d books, got %d", len(books), len(list.List))
	}
	b := e.do(u, "GET", "/api/books/bk-2", nil).wantStatus(t, 200)
	if b.Body["title"] != "Riyadus Salihin" {
		t.Errorf("body: %v", b.Body)
	}
	if _, has := b.Body["status"]; has {
		t.Error("catalogue books must not carry personal state")
	}
	e.do(u, "GET", "/api/books/nope", nil).wantStatus(t, 404)
	// With publishing off, users cannot add to the catalogue; they can never delete or edit entries.
	e.do(u, "POST", "/api/books", map[string]any{"title": "x", "author": "y", "language": "English", "category": "z"}).wantStatus(t, 403)
	e.do(u, "DELETE", "/api/books/bk-1", nil).wantStatus(t, 405)
	e.do(u, "PATCH", "/api/books/bk-1", map[string]any{"title": "x"}).wantStatus(t, 405)
	if me := e.do(u, "GET", "/api/me", nil).wantStatus(t, 200); me.Body["canAddBooks"] != false {
		t.Errorf("canAddBooks should be false without a publisher: %v", me.Body)
	}
}

// ---------------------------------------------------------------- personal library

func TestAddUpdateDeleteLibraryEntry(t *testing.T) {
	e := newEnv(t)
	u := newUser(t, "ada")

	e.do(u, "GET", "/api/my/library", nil).wantStatus(t, 200)

	added := e.do(u, "POST", "/api/my/library", map[string]any{"bookId": "bk-1"}).wantStatus(t, 201)
	if added.Body["status"] != "want_to_read" || added.Body["progress"] != float64(0) || added.Body["bookId"] != "bk-1" {
		t.Fatalf("defaults wrong: %v", added.Body)
	}
	if added.Body["book"].(map[string]any)["title"] != "Ihya Ulum al-Din" {
		t.Errorf("entry must embed the catalogue book: %v", added.Body)
	}

	e.do(u, "POST", "/api/my/library", map[string]any{"bookId": "bk-1"}).wantStatus(t, 409) // no duplicates
	e.do(u, "POST", "/api/my/library", map[string]any{"bookId": "ghost"}).wantStatus(t, 404)
	e.do(u, "POST", "/api/my/library", map[string]any{}).wantStatus(t, 400)

	p := e.do(u, "PATCH", "/api/my/library/bk-1", map[string]any{"progress": 40}).wantStatus(t, 200)
	if p.Body["status"] != "reading" || p.Body["progress"] != float64(40) {
		t.Errorf("progress should start reading: %v", p.Body)
	}
	p = e.do(u, "PATCH", "/api/my/library/bk-1", map[string]any{"progress": 100}).wantStatus(t, 200)
	if p.Body["status"] != "reading" {
		t.Errorf("progress must never auto-complete: %v", p.Body)
	}
	p = e.do(u, "PATCH", "/api/my/library/bk-1", map[string]any{"status": "completed", "rating": 5, "notes": "  great  ", "tags": []string{"Fiqh", "fiqh", " Classic "}}).wantStatus(t, 200)
	if p.Body["status"] != "completed" || p.Body["progress"] != float64(100) || p.Body["rating"] != float64(5) || p.Body["notes"] != "great" {
		t.Errorf("update wrong: %v", p.Body)
	}
	if tags := p.Body["tags"].([]any); len(tags) != 2 || tags[0] != "Fiqh" || tags[1] != "Classic" {
		t.Errorf("tags not normalised: %v", p.Body["tags"])
	}
	p = e.do(u, "PATCH", "/api/my/library/bk-1", map[string]any{"rating": nil}).wantStatus(t, 200)
	if _, has := p.Body["rating"]; has {
		t.Error("null rating must clear the rating")
	}
	// Purchase details belong to a copy now, not to the reading record.
	e.do(u, "PATCH", "/api/my/library/bk-1", map[string]any{"price": 49.9}).wantStatus(t, 400)
	p = e.do(u, "PATCH", "/api/my/library/bk-1", map[string]any{"status": "reading"}).wantStatus(t, 200)
	if p.Body["progress"] != float64(0) {
		t.Errorf("re-reading a completed book restarts at 0: %v", p.Body)
	}

	e.do(u, "GET", "/api/my/library/bk-1", nil).wantStatus(t, 200)
	if l := e.do(u, "GET", "/api/my/library", nil).wantStatus(t, 200); len(l.List) != 1 {
		t.Fatalf("library should have 1 entry, got %d", len(l.List))
	}

	e.do(u, "DELETE", "/api/my/library/bk-1", nil).wantStatus(t, 204)
	e.do(u, "GET", "/api/my/library/bk-1", nil).wantStatus(t, 404)
	e.do(u, "DELETE", "/api/my/library/bk-1", nil).wantStatus(t, 404)
	e.do(u, "PATCH", "/api/my/library/bk-1", map[string]any{"progress": 5}).wantStatus(t, 404)
}

func TestLibraryValidation(t *testing.T) {
	e := newEnv(t)
	u := newUser(t, "ada")
	e.do(u, "POST", "/api/my/library", map[string]any{"bookId": "bk-1"}).wantStatus(t, 201)

	bad := []map[string]any{
		{"status": "finished"},
		{"status": nil},
		{"progress": 101},
		{"progress": -1},
		{"rating": 0},
		{"rating": 6},
		{"notes": strings.Repeat("x", 5001)},
		{"userId": "someone-else"}, // unknown fields are rejected, never trusted
	}
	for _, body := range bad {
		if r := e.do(u, "PATCH", "/api/my/library/bk-1", body); r.Status != 400 {
			t.Errorf("%v: status %d, want 400 (%s)", body, r.Status, r.Raw)
		}
	}
	e.do(u, "PATCH", "/api/my/library/bk-1", "{not json").wantStatus(t, 400)
	e.do(u, "PATCH", "/api/my/library/bk-1", `{"progress": 1} {"progress": 2}`).wantStatus(t, 400)
}

// ---------------------------------------------------------------- multi-user behaviour

func TestSameBookIndependentStatePerUser(t *testing.T) {
	e := newEnv(t)
	a, b := newUser(t, "a"), newUser(t, "b")

	e.do(a, "POST", "/api/my/library", map[string]any{"bookId": "bk-1", "status": "reading", "progress": 50}).wantStatus(t, 201)
	e.do(b, "POST", "/api/my/library", map[string]any{"bookId": "bk-1", "status": "completed", "rating": 4}).wantStatus(t, 201)

	ga := e.do(a, "GET", "/api/my/library/bk-1", nil).wantStatus(t, 200)
	gb := e.do(b, "GET", "/api/my/library/bk-1", nil).wantStatus(t, 200)
	if ga.Body["status"] != "reading" || ga.Body["progress"] != float64(50) {
		t.Errorf("user A: %v", ga.Body)
	}
	if gb.Body["status"] != "completed" || gb.Body["progress"] != float64(100) || gb.Body["rating"] != float64(4) {
		t.Errorf("user B: %v", gb.Body)
	}
}

func TestUserCannotReadOrModifyAnotherUsersLibrary(t *testing.T) {
	e := newEnv(t)
	a, b := newUser(t, "a"), newUser(t, "b")
	e.do(a, "POST", "/api/my/library", map[string]any{"bookId": "bk-2", "status": "reading", "progress": 30, "notes": "private"}).wantStatus(t, 201)

	// B has nothing, sees nothing.
	if l := e.do(b, "GET", "/api/my/library", nil).wantStatus(t, 200); len(l.List) != 0 {
		t.Fatalf("B must not see A's entries: %s", l.Raw)
	}
	e.do(b, "GET", "/api/my/library/bk-2", nil).wantStatus(t, 404)
	e.do(b, "PATCH", "/api/my/library/bk-2", map[string]any{"progress": 99, "notes": "hijacked"}).wantStatus(t, 404)
	e.do(b, "DELETE", "/api/my/library/bk-2", nil).wantStatus(t, 404)

	// A's entry is untouched.
	ga := e.do(a, "GET", "/api/my/library/bk-2", nil).wantStatus(t, 200)
	if ga.Body["progress"] != float64(30) || ga.Body["notes"] != "private" {
		t.Fatalf("A's entry was changed by B: %v", ga.Body)
	}

	// Smuggling a user id through the body or query must not change who the caller is.
	e.do(b, "POST", "/api/my/library", map[string]any{"bookId": "bk-3", "userId": ga.Body["bookId"]}).wantStatus(t, 400)
	if l := e.do(b, "GET", "/api/my/library?userId=anything", nil); len(l.List) != 0 {
		t.Fatal("query parameters must not select a user")
	}
}

// ---------------------------------------------------------------- collections

func TestCollectionLifecycle(t *testing.T) {
	e := newEnv(t)
	u := newUser(t, "ada")
	e.do(u, "POST", "/api/my/library", map[string]any{"bookId": "bk-1"}).wantStatus(t, 201)
	e.do(u, "POST", "/api/my/library", map[string]any{"bookId": "bk-2"}).wantStatus(t, 201)

	c := e.do(u, "POST", "/api/collections", map[string]any{"name": "  Backend Books  ", "description": "d", "color": "blue"}).wantStatus(t, 201)
	id := c.Body["id"].(string)
	if c.Body["name"] != "Backend Books" || c.Body["color"] != "blue" || len(c.Body["bookIds"].([]any)) != 0 {
		t.Fatalf("create: %v", c.Body)
	}
	e.do(u, "POST", "/api/collections", map[string]any{"name": "  "}).wantStatus(t, 400)
	e.do(u, "POST", "/api/collections", map[string]any{}).wantStatus(t, 400)
	e.do(u, "POST", "/api/collections", map[string]any{"name": "x", "color": "pink"}).wantStatus(t, 400)

	r := e.do(u, "PUT", "/api/collections/"+id+"/books/bk-1", nil).wantStatus(t, 200)
	r = e.do(u, "PUT", "/api/collections/"+id+"/books/bk-1", nil).wantStatus(t, 200) // idempotent
	e.do(u, "PUT", "/api/collections/"+id+"/books/bk-2", nil).wantStatus(t, 200)
	if got := r.Body["bookIds"].([]any); len(got) != 1 || got[0] != "bk-1" {
		t.Errorf("membership: %v", got)
	}
	e.do(u, "PUT", "/api/collections/"+id+"/books/bk-3", nil).wantStatus(t, 404) // not in my library

	entry := e.do(u, "GET", "/api/my/library/bk-1", nil).wantStatus(t, 200)
	if ids := entry.Body["collectionIds"].([]any); len(ids) != 1 || ids[0] != id {
		t.Errorf("entry should list its collection: %v", entry.Body["collectionIds"])
	}

	p := e.do(u, "PATCH", "/api/collections/"+id, map[string]any{"name": "Renamed", "description": nil}).wantStatus(t, 200)
	if p.Body["name"] != "Renamed" || p.Body["color"] != "blue" {
		t.Errorf("rename: %v", p.Body)
	}
	if _, has := p.Body["description"]; has {
		t.Error("null description must clear it")
	}

	d := e.do(u, "DELETE", "/api/collections/"+id+"/books/bk-1", nil).wantStatus(t, 200)
	if got := d.Body["bookIds"].([]any); len(got) != 1 || got[0] != "bk-2" {
		t.Errorf("after removing bk-1: %v", got)
	}

	// Removing a book from the library takes it out of every collection.
	e.do(u, "DELETE", "/api/my/library/bk-2", nil).wantStatus(t, 204)
	list := e.do(u, "GET", "/api/collections", nil).wantStatus(t, 200)
	if len(list.List) != 1 || len(list.List[0]["bookIds"].([]any)) != 0 {
		t.Errorf("collection should be empty now: %s", list.Raw)
	}

	e.do(u, "DELETE", "/api/collections/"+id, nil).wantStatus(t, 204)
	e.do(u, "DELETE", "/api/collections/"+id, nil).wantStatus(t, 404)
	e.do(u, "GET", "/api/my/library/bk-1", nil).wantStatus(t, 200) // the book itself survives
}

func TestUserCannotReadOrModifyAnotherUsersCollections(t *testing.T) {
	e := newEnv(t)
	a, b := newUser(t, "a"), newUser(t, "b")

	e.do(a, "POST", "/api/my/library", map[string]any{"bookId": "bk-1"}).wantStatus(t, 201)
	c := e.do(a, "POST", "/api/collections", map[string]any{"name": "A's shelf"}).wantStatus(t, 201)
	id := c.Body["id"].(string)
	e.do(a, "PUT", "/api/collections/"+id+"/books/bk-1", nil).wantStatus(t, 200)

	// B (who also owns bk-1) cannot see, rename, delete or reach into A's collection.
	e.do(b, "POST", "/api/my/library", map[string]any{"bookId": "bk-1"}).wantStatus(t, 201)
	if l := e.do(b, "GET", "/api/collections", nil).wantStatus(t, 200); len(l.List) != 0 {
		t.Fatalf("B must not see A's collections: %s", l.Raw)
	}
	e.do(b, "PATCH", "/api/collections/"+id, map[string]any{"name": "hijacked"}).wantStatus(t, 404)
	e.do(b, "DELETE", "/api/collections/"+id, nil).wantStatus(t, 404)
	e.do(b, "PUT", "/api/collections/"+id+"/books/bk-1", nil).wantStatus(t, 404)
	e.do(b, "DELETE", "/api/collections/"+id+"/books/bk-1", nil).wantStatus(t, 404)

	// A's collection is intact.
	got := e.do(a, "GET", "/api/collections", nil).wantStatus(t, 200)
	if len(got.List) != 1 || got.List[0]["name"] != "A's shelf" || len(got.List[0]["bookIds"].([]any)) != 1 {
		t.Fatalf("A's collection changed: %s", got.Raw)
	}
	// B's entry for the same book is not filed anywhere.
	if ids := e.do(b, "GET", "/api/my/library/bk-1", nil).Body["collectionIds"].([]any); len(ids) != 0 {
		t.Errorf("B's entry leaked A's collection: %v", ids)
	}
	e.do(b, "GET", "/api/collections/not-a-uuid", nil)
	e.do(b, "PATCH", "/api/collections/not-a-uuid", map[string]any{"name": "x"}).wantStatus(t, 404)
}

// The database itself must refuse to link a collection and a book entry that belong to different users.
func TestDatabaseRejectsCrossUserCollectionLinks(t *testing.T) {
	e := newEnv(t)
	a, b := newUser(t, "a"), newUser(t, "b")
	e.do(a, "POST", "/api/my/library", map[string]any{"bookId": "bk-1"}).wantStatus(t, 201)
	e.do(b, "POST", "/api/my/library", map[string]any{"bookId": "bk-1"}).wantStatus(t, 201)
	c := e.do(a, "POST", "/api/collections", map[string]any{"name": "A's"}).wantStatus(t, 201)

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, testDBURL)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)

	var aID, bID string
	_ = conn.QueryRow(ctx, `SELECT id::text FROM users WHERE email = $1`, strings.ToLower(a)).Scan(&aID)
	_ = conn.QueryRow(ctx, `SELECT id::text FROM users WHERE email = $1`, strings.ToLower(b)).Scan(&bID)

	// B's entry into A's collection, claiming either owner.
	for _, owner := range []string{aID, bID} {
		if _, err := conn.Exec(ctx, `INSERT INTO collection_books (collection_id, user_id, book_id) VALUES ($1, $2, 'bk-1')`,
			c.Body["id"], owner); err == nil && owner == bID {
			t.Errorf("collection of A linked to B's entry")
		}
	}
	var n int
	_ = conn.QueryRow(ctx, `SELECT count(*) FROM collection_books WHERE collection_id = $1 AND user_id = $2`, c.Body["id"], bID).Scan(&n)
	if n != 0 {
		t.Fatal("cross-user link exists in the database")
	}
}

func TestUserBookUniquePerUserAndBook(t *testing.T) {
	e := newEnv(t)
	u := newUser(t, "ada")
	e.do(u, "POST", "/api/my/library", map[string]any{"bookId": "bk-3"}).wantStatus(t, 201)

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, testDBURL)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	_, err = conn.Exec(ctx, `INSERT INTO user_books (user_id, book_id) SELECT user_id, book_id FROM user_books WHERE book_id = 'bk-3' LIMIT 1`)
	if err == nil {
		t.Fatal("(user_id, book_id) must be unique")
	}
}

func TestErrorShape(t *testing.T) {
	e := newEnv(t)
	r := e.do(newUser(t, "ada"), "PATCH", "/api/my/library/bk-1", map[string]any{"progress": 5}).wantStatus(t, 404)
	errBody, ok := r.Body["error"].(map[string]any)
	if !ok || errBody["code"] == "" || errBody["message"] == "" {
		t.Fatalf("errors must be {error:{code,message}}: %s", r.Raw)
	}
	e.do(newUser(t, "ada"), "GET", "/api/nope", nil).wantStatus(t, 404)
}

func (e *env) rawConn(t *testing.T) *pgx.Conn {
	t.Helper()
	conn, err := pgx.Connect(context.Background(), testDBURL)
	if err != nil {
		t.Fatal(err)
	}
	return conn
}

// doRaw sends a raw body with the given Content-Type.
func (e *env) doRaw(user, method, path, contentType string, body []byte) resp {
	e.t.Helper()
	req, _ := http.NewRequest(method, e.srv.URL+path, bytes.NewReader(body))
	req.Header.Set("Content-Type", contentType)
	if user != "" {
		req.Header.Set("X-Dev-User", user)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	out := resp{Status: res.StatusCode, Raw: string(raw)}
	_ = json.Unmarshal(raw, &out.Body)
	return out
}
