package api_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"libax/internal/api"
	"libax/internal/catalogue"
	"libax/internal/health"
	"libax/internal/store"
)

// exec runs raw SQL against the test database.
func (e *env) exec(sql string, args ...any) {
	e.t.Helper()
	conn := e.rawConn(e.t)
	defer conn.Close(context.Background())
	if _, err := conn.Exec(context.Background(), sql, args...); err != nil {
		e.t.Fatal(err)
	}
}

// resetAdmins demotes every administrator, so a test starts from "no admins".
func (e *env) resetAdmins() { e.exec(`UPDATE users SET role = 'member' WHERE role = 'admin'`) }

// makeAdmin provisions the user through the API and then grants the role directly in the database. Tests
// never grant roles through the client: that is exactly what must be impossible.
func (e *env) makeAdmin(email string) {
	e.t.Helper()
	e.do(email, "GET", "/api/me", nil).wantStatus(e.t, 200)
	e.exec(`UPDATE users SET role = 'admin', status = 'active' WHERE email = $1`, strings.ToLower(email))
}

func (e *env) memberID(email string) string { return userID(e.t, e, email) }

func (e *env) auditActions(admin string) []string {
	e.t.Helper()
	var out []string
	for _, ev := range e.do(admin, "GET", "/api/admin/audit?limit=200", nil).wantStatus(e.t, 200).List {
		out = append(out, ev["action"].(string))
	}
	return out
}

var adminRoutes = []struct{ method, path string }{
	{"GET", "/api/admin/members"},
	{"PATCH", "/api/admin/members/00000000-0000-0000-0000-000000000000"},
	{"GET", "/api/admin/system"},
	{"GET", "/api/admin/audit"},
	{"GET", "/api/admin/catalogue"},
	{"PATCH", "/api/admin/catalogue/bk-1"},
}

func TestMembersCannotUseAdminAPIsButAdminsCan(t *testing.T) {
	e := newEnv(t)
	member, admin := newUser(t, "member"), newUser(t, "admin")
	e.makeAdmin(admin)
	e.do(member, "GET", "/api/me", nil).wantStatus(t, 200)

	// A normal member can use the normal APIs but every /api/admin route is refused.
	e.do(member, "GET", "/api/books", nil).wantStatus(t, 200)
	for _, r := range adminRoutes {
		body := map[string]any{"role": "admin", "hidden": true}
		got := e.do(member, r.method, r.path, body)
		if got.Status != 403 {
			t.Errorf("member %s %s: status %d, want 403 (%s)", r.method, r.path, got.Status, got.Raw)
		}
	}
	// Admin routes require a login at all.
	for _, r := range adminRoutes {
		res := e.doRaw("", r.method, r.path, "application/json", nil)
		if res.Status != 200 && res.Status != 401 && res.Status != 403 {
			t.Errorf("anonymous %s %s: status %d", r.method, r.path, res.Status)
		}
	}

	// An administrator reaches them.
	for _, path := range []string{"/api/admin/members", "/api/admin/system", "/api/admin/audit", "/api/admin/catalogue"} {
		e.do(admin, "GET", path, nil).wantStatus(t, 200)
	}
	me := e.do(admin, "GET", "/api/me", nil).wantStatus(t, 200)
	if me.Body["role"] != "admin" || me.Body["status"] != "active" {
		t.Errorf("/api/me should report role and status: %v", me.Body)
	}
	if mm := e.do(member, "GET", "/api/me", nil).wantStatus(t, 200); mm.Body["role"] != "member" {
		t.Errorf("a new member is a member: %v", mm.Body)
	}
}

func TestClientCannotSelfPromoteOrChooseTheActor(t *testing.T) {
	e := newEnv(t)
	member, admin := newUser(t, "member"), newUser(t, "admin")
	e.makeAdmin(admin)
	id := e.memberID(member)

	// Self-promotion through the admin API, through ordinary APIs, through the query string and headers.
	e.do(member, "PATCH", "/api/admin/members/"+id, map[string]any{"role": "admin"}).wantStatus(t, 403)
	e.do(member, "POST", "/api/my/library", map[string]any{"bookId": "bk-1", "role": "admin"}).wantStatus(t, 400)
	e.do(member, "POST", "/api/collections", map[string]any{"name": "x", "role": "admin"}).wantStatus(t, 400)
	for _, path := range []string{"/api/me?role=admin", "/api/admin/members?role=admin&userId=" + id} {
		if res := e.do(member, "GET", path, nil); res.Status == 200 && strings.Contains(res.Raw, `"role":"admin"`) && strings.HasPrefix(path, "/api/me") {
			t.Errorf("query string must not change the role: %s", res.Raw)
		}
	}
	if got := e.do(member, "GET", "/api/me", nil); got.Body["role"] != "member" {
		t.Fatalf("member was promoted: %v", got.Body)
	}

	// An admin cannot name the actor in the body: the audit actor is whoever is authenticated.
	e.do(admin, "PATCH", "/api/admin/members/"+id, map[string]any{"role": "admin", "actorId": id, "actor_user_id": id}).wantStatus(t, 400)
	e.do(admin, "PATCH", "/api/admin/members/"+id, map[string]any{"role": "admin"}).wantStatus(t, 200)
	events := e.do(admin, "GET", "/api/admin/audit", nil).wantStatus(t, 200).List
	if len(events) == 0 || events[0]["actor"] != strings.ToLower(admin) || events[0]["action"] != "member.promoted" {
		t.Fatalf("audit actor must be the authenticated admin: %v", events)
	}

	// The body cannot change another member's identity either: unknown fields are rejected.
	other := newUser(t, "other")
	oid := e.memberID(other)
	e.do(admin, "PATCH", "/api/admin/members/"+oid, map[string]any{"email": "someone@else.test"}).wantStatus(t, 400)
	e.do(admin, "PATCH", "/api/admin/members/"+oid, map[string]any{"name": "x"}).wantStatus(t, 400)
	if got := e.do(other, "GET", "/api/me", nil); got.Body["email"] != strings.ToLower(other) {
		t.Errorf("identity must not change: %v", got.Body)
	}
}

func TestPromoteDemoteDisableEnableAreAudited(t *testing.T) {
	e := newEnv(t)
	admin, member := newUser(t, "admin"), newUser(t, "member")
	e.makeAdmin(admin)
	id := e.memberID(member)
	path := "/api/admin/members/" + id

	if got := e.do(admin, "PATCH", path, map[string]any{"role": "admin"}).wantStatus(t, 200); got.Body["role"] != "admin" {
		t.Fatalf("promote: %v", got.Body)
	}
	e.do(member, "GET", "/api/admin/members", nil).wantStatus(t, 200) // the promoted member is an admin now
	if got := e.do(admin, "PATCH", path, map[string]any{"role": "member"}).wantStatus(t, 200); got.Body["role"] != "member" {
		t.Fatalf("demote: %v", got.Body)
	}
	e.do(member, "GET", "/api/admin/members", nil).wantStatus(t, 403) // and a member again
	e.do(admin, "PATCH", path, map[string]any{"status": "disabled"}).wantStatus(t, 200)
	e.do(admin, "PATCH", path, map[string]any{"status": "active"}).wantStatus(t, 200)

	// A change that changes nothing is accepted and leaves no audit noise.
	before := len(e.auditActions(admin))
	e.do(admin, "PATCH", path, map[string]any{"role": "member", "status": "active"}).wantStatus(t, 200)
	if after := len(e.auditActions(admin)); after != before {
		t.Errorf("a no-op must not be audited (%d -> %d)", before, after)
	}

	actions := strings.Join(e.auditActions(admin), ",")
	for _, want := range []string{"member.promoted", "member.demoted", "member.disabled", "member.enabled"} {
		if !strings.Contains(actions, want) {
			t.Errorf("audit trail is missing %s: %s", want, actions)
		}
	}
	ev := e.do(admin, "GET", "/api/admin/audit?limit=1", nil).List
	meta := ev[0]["metadata"].(map[string]any)
	if len(ev) != 1 || meta["email"] != strings.ToLower(member) || meta["from"] == nil || meta["to"] == nil {
		t.Errorf("audit metadata: %v", ev)
	}
	if ev[0]["targetType"] != "member" || ev[0]["targetId"] != id {
		t.Errorf("audit target: %v", ev[0])
	}

	// Validation.
	e.do(admin, "PATCH", path, map[string]any{}).wantStatus(t, 400)
	e.do(admin, "PATCH", path, map[string]any{"role": "owner"}).wantStatus(t, 400)
	e.do(admin, "PATCH", path, map[string]any{"status": "banned"}).wantStatus(t, 400)
	e.do(admin, "PATCH", "/api/admin/members/not-a-uuid", map[string]any{"role": "admin"}).wantStatus(t, 404)
	e.do(admin, "PATCH", "/api/admin/members/00000000-0000-0000-0000-000000000000", map[string]any{"role": "admin"}).wantStatus(t, 404)
	// There is no deletion.
	e.do(admin, "DELETE", path, nil).wantStatus(t, 405)
}

func TestDisabledMemberIsLockedOutEverywhereEvenAfterLoggingInAgain(t *testing.T) {
	e := newEnv(t)
	admin, member := newUser(t, "admin"), newUser(t, "member")
	e.makeAdmin(admin)
	id := e.memberID(member)
	e.do(member, "POST", "/api/my/library", map[string]any{"bookId": "bk-1"}).wantStatus(t, 201)

	e.do(admin, "PATCH", "/api/admin/members/"+id, map[string]any{"status": "disabled"}).wantStatus(t, 200)

	// Every member operation is refused with a clear code, on repeated "logins" (each request re-authenticates).
	for range 2 {
		for _, req := range []struct{ method, path string }{
			{"GET", "/api/me"}, {"GET", "/api/books"}, {"GET", "/api/my/library"},
			{"POST", "/api/my/library"}, {"GET", "/api/collections"}, {"GET", "/api/copies"},
		} {
			got := e.do(member, req.method, req.path, map[string]any{"bookId": "bk-2"})
			if got.Status != 403 || got.Body["error"].(map[string]any)["code"] != "account_disabled" {
				t.Errorf("disabled %s %s: %d %s", req.method, req.path, got.Status, got.Raw)
			}
		}
	}
	// A disabled admin is not an admin either.
	e.exec(`UPDATE users SET role = 'admin' WHERE id = $1`, id)
	e.do(member, "GET", "/api/admin/members", nil).wantStatus(t, 403)
	e.exec(`UPDATE users SET role = 'member' WHERE id = $1`, id)

	// Their data is kept, and re-enabling restores access without losing anything.
	e.do(admin, "PATCH", "/api/admin/members/"+id, map[string]any{"status": "active"}).wantStatus(t, 200)
	if l := e.do(member, "GET", "/api/my/library", nil).wantStatus(t, 200); len(l.List) != 1 {
		t.Errorf("library should be intact: %s", l.Raw)
	}
}

func TestLastActiveAdministratorCannotBeDemotedOrDisabled(t *testing.T) {
	e := newEnv(t)
	e.resetAdmins()
	a, b := newUser(t, "a"), newUser(t, "b")
	e.makeAdmin(a)
	aid := e.memberID(a)

	// The only active admin: nothing may remove them, not even themselves.
	for _, body := range []map[string]any{{"role": "member"}, {"status": "disabled"}, {"role": "member", "status": "disabled"}} {
		got := e.do(a, "PATCH", "/api/admin/members/"+aid, body).wantStatus(t, 409)
		if got.Body["error"].(map[string]any)["code"] != "last_admin" {
			t.Errorf("%v: %s", body, got.Raw)
		}
	}
	if m := e.do(a, "GET", "/api/me", nil); m.Body["role"] != "admin" || m.Body["status"] != "active" {
		t.Fatalf("the last admin was changed: %v", m.Body)
	}

	// A second admin makes it possible, and then the new last one is protected in turn.
	e.do(b, "GET", "/api/me", nil).wantStatus(t, 200)
	bid := e.memberID(b)
	e.do(a, "PATCH", "/api/admin/members/"+bid, map[string]any{"role": "admin"}).wantStatus(t, 200)
	e.do(b, "PATCH", "/api/admin/members/"+aid, map[string]any{"status": "disabled"}).wantStatus(t, 200)
	e.do(b, "PATCH", "/api/admin/members/"+bid, map[string]any{"role": "member"}).wantStatus(t, 409)
	e.do(b, "PATCH", "/api/admin/members/"+bid, map[string]any{"status": "disabled"}).wantStatus(t, 409)

	// Disabled admins are not counted: a disabled admin plus one active admin is still "last".
	var admins int
	conn := e.rawConn(t)
	defer conn.Close(context.Background())
	_ = conn.QueryRow(context.Background(), `SELECT count(*) FROM users WHERE role = 'admin' AND status = 'active'`).Scan(&admins)
	if admins != 1 {
		t.Fatalf("expected exactly one active admin, found %d", admins)
	}
	// Demoting or disabling a non-admin is never blocked.
	e.do(b, "PATCH", "/api/admin/members/"+aid, map[string]any{"role": "member"}).wantStatus(t, 200)
}

func TestBootstrapAdminRules(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(ctx, testDBURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	e := newEnv(t)
	db.BootstrapAdmins = []string{"first@boot.test", "SECOND@boot.test"}

	provision := func(sub, email string) store.User {
		t.Helper()
		u, err := db.UpsertUser(ctx, sub, email, "")
		if err != nil {
			t.Fatal(err)
		}
		return u
	}
	suffix := newUser(t, "x")[:12]
	first, second := "first@boot.test", "second@boot.test"

	// Not on the list: never promoted, whatever else is true.
	e.resetAdmins()
	if u := provision("sub-stranger-"+suffix, "stranger-"+suffix+"@boot.test"); u.Role != "member" || u.Status != "active" {
		t.Errorf("a stranger became %s/%s", u.Role, u.Status)
	}

	// On the list while the database has no active admin: promoted (case-insensitive), and audited.
	e.exec(`DELETE FROM users WHERE lower(email) IN ($1, $2)`, first, second)
	if u := provision("sub-first-"+suffix, "First@Boot.Test"); u.Role != "admin" || u.Status != "active" {
		t.Fatalf("the allow-listed identity should become the first admin: %+v", u)
	}

	// An administrator exists now, so the list no longer promotes anyone.
	if u := provision("sub-second-"+suffix, second); u.Role != "member" {
		t.Errorf("once an admin exists the allow-list must not promote: %+v", u)
	}

	// Demoting the bootstrap admin sticks: logging in again does not undo it while another admin exists.
	e.exec(`UPDATE users SET role = 'admin' WHERE lower(email) = $1`, second)
	e.exec(`UPDATE users SET role = 'member' WHERE lower(email) = $1`, first)
	if u := provision("sub-first-"+suffix, first); u.Role != "member" {
		t.Errorf("a demoted bootstrap admin must stay demoted: %+v", u)
	}

	// A disabled member whose address is on the list stays disabled while an admin exists.
	e.exec(`UPDATE users SET status = 'disabled' WHERE lower(email) = $1`, first)
	if u := provision("sub-first-"+suffix, first); u.Status != "disabled" {
		t.Errorf("logging in must not re-enable anyone: %+v", u)
	}

	// Break-glass: with no active admin left, the allow-listed identity is promoted and re-enabled.
	e.resetAdmins()
	if u := provision("sub-first-"+suffix, first); u.Role != "admin" || u.Status != "active" {
		t.Errorf("recovery bootstrap failed: %+v", u)
	}

	var logged int
	conn := e.rawConn(t)
	defer conn.Close(ctx)
	_ = conn.QueryRow(ctx, `SELECT count(*) FROM audit_events WHERE action = 'admin.bootstrapped'`).Scan(&logged)
	if logged < 2 {
		t.Errorf("bootstrap promotions must be audited (found %d)", logged)
	}
}

func TestExistingUsersStayOrdinaryAfterMigration(t *testing.T) {
	e := newEnv(t)
	// A row created the way the old code did (no role/status columns mentioned) gets the safe defaults.
	e.exec(`INSERT INTO users (cf_subject, email) VALUES ('legacy-user-'||gen_random_uuid(), 'legacy-'||gen_random_uuid()||'@old.test')`)
	conn := e.rawConn(t)
	defer conn.Close(context.Background())
	var role, status string
	if err := conn.QueryRow(context.Background(), `SELECT role, status FROM users WHERE email LIKE 'legacy-%@old.test' LIMIT 1`).Scan(&role, &status); err != nil {
		t.Fatal(err)
	}
	if role != "member" || status != "active" {
		t.Errorf("defaults must be member/active, got %s/%s", role, status)
	}
	// And the constraints reject anything else.
	if _, err := conn.Exec(context.Background(), `UPDATE users SET role = 'owner' WHERE email LIKE 'legacy-%@old.test'`); err == nil {
		t.Error("an unknown role must be rejected by the database")
	}
	if _, err := conn.Exec(context.Background(), `UPDATE users SET status = 'banned' WHERE email LIKE 'legacy-%@old.test'`); err == nil {
		t.Error("an unknown status must be rejected by the database")
	}
}

func TestSystemStatusNeverLeaksSecrets(t *testing.T) {
	const secret = "sk-ant-SUPER-SECRET-VALUE"
	svcs := []health.Service{
		{Key: "postgres", Configured: true, Probe: func(context.Context) error { return nil }},
		// A failing probe whose error text contains a credential: it must never reach the response.
		{Key: "googleSheets", Configured: true, Probe: func(context.Context) error {
			return errors.New("GET https://sheets.example/?key=" + secret + ": status 403")
		}},
		{Key: "googleBooks", Configured: true},
		{Key: "coverScanner", Configured: false},
		{Key: "cloudflareAccess", Configured: true, Detail: "development"},
	}
	info := api.SystemInfo{Env: "development", AuthMode: "dev", CatalogueSource: "fixture", BookLookup: "online", Submissions: true}
	e := newEnvWith(t, books, nil, 0, func(d *api.Deps) { d.Health, d.Info = svcs, info })
	admin := newUser(t, "admin")
	e.makeAdmin(admin)

	res := e.do(admin, "GET", "/api/admin/system", nil).wantStatus(t, 200)
	if strings.Contains(res.Raw, secret) || strings.Contains(strings.ToLower(res.Raw), "key=") || strings.Contains(res.Raw, "sheets.example") {
		t.Fatalf("the status response leaked probe/secret text: %s", res.Raw)
	}
	got := map[string]map[string]any{}
	for _, s := range res.Body["services"].([]any) {
		m := s.(map[string]any)
		got[m["key"].(string)] = m
	}
	want := map[string]string{"postgres": "healthy", "googleSheets": "unavailable", "googleBooks": "configured", "coverScanner": "not_configured", "cloudflareAccess": "configured"}
	for k, w := range want {
		if got[k]["status"] != w {
			t.Errorf("%s: status %v, want %s", k, got[k]["status"], w)
		}
	}
	// Only status vocabulary and fixed descriptions: no field named like a credential.
	for k := range res.Body["environment"].(map[string]any) {
		if strings.Contains(strings.ToLower(k), "key") || strings.Contains(strings.ToLower(k), "secret") || strings.Contains(strings.ToLower(k), "token") {
			t.Errorf("environment must not carry credential-like fields: %s", k)
		}
	}
	for _, s := range got {
		for k := range s {
			if k != "key" && k != "configured" && k != "status" && k != "detail" && k != "latencyMs" {
				t.Errorf("unexpected status field %q", k)
			}
		}
	}
}

func TestAdminCatalogueFlagsProblemsAndHidingIsSoftAndReversible(t *testing.T) {
	cat := staticCatalogue{
		{ID: "bk-1", Title: "Ihya Ulum al-Din", Author: "Al-Ghazali", ISBN: "9789670000015", Language: "English", Category: "Kitab Turath"},
		{ID: "bk-2", Title: "  ihya   ULUM al-din ", Author: "al-ghazali", Language: "English", Category: "Kitab Turath"}, // duplicate, no ISBN
		{ID: "bk-3", Title: "Riyadus Salihin", Author: "An-Nawawi", ISBN: "9789670000022", Language: "Bahasa Melayu", Category: "Hadith"},
	}
	e := newEnvWith(t, cat, nil, 0)
	admin, reader := newUser(t, "admin"), newUser(t, "reader")
	e.makeAdmin(admin)

	list := func() map[string]map[string]any {
		out := map[string]map[string]any{}
		for _, b := range e.do(admin, "GET", "/api/admin/catalogue", nil).wantStatus(t, 200).List {
			out[b["id"].(string)] = b
		}
		return out
	}
	issues := func(id string) string { return strings.Join(toStrings(list()[id]["issues"]), ",") }
	if issues("bk-1") != "possible_duplicate" || issues("bk-2") != "missing_isbn,possible_duplicate" || issues("bk-3") != "" {
		t.Errorf("issues: bk-1=%q bk-2=%q bk-3=%q", issues("bk-1"), issues("bk-2"), issues("bk-3"))
	}

	// A reader has bk-3 in their library and owns a copy; then an admin hides it.
	e.do(reader, "POST", "/api/my/library", map[string]any{"bookId": "bk-3"}).wantStatus(t, 201)
	copyID := newCopy(t, e, reader, "bk-3", nil)
	if b := list()["bk-3"]; b["readers"] != float64(1) || b["copies"] != float64(1) {
		t.Errorf("admin stats: %v", b)
	}
	other := newUser(t, "other")
	e.do(admin, "PATCH", "/api/admin/catalogue/bk-3", map[string]any{"hidden": true}).wantStatus(t, 200)
	e.do(admin, "PATCH", "/api/admin/catalogue/bk-3", map[string]any{"hidden": true}).wantStatus(t, 200) // idempotent

	// Members no longer see it, cannot newly add it or record a copy of it ...
	for _, b := range e.do(other, "GET", "/api/books", nil).wantStatus(t, 200).List {
		if b["id"] == "bk-3" {
			t.Fatal("a hidden book must not be listed for members")
		}
	}
	e.do(other, "GET", "/api/books/bk-3", nil).wantStatus(t, 404)
	e.do(other, "POST", "/api/my/library", map[string]any{"bookId": "bk-3"}).wantStatus(t, 404)
	e.do(other, "POST", "/api/copies", map[string]any{"bookId": "bk-3"}).wantStatus(t, 404)
	// ... but nothing that already exists is destroyed, and the admin still sees it, flagged.
	e.do(reader, "GET", "/api/my/library/bk-3", nil).wantStatus(t, 200)
	if findCopy(t, e, reader, copyID)["id"] != copyID {
		t.Error("existing copies must survive moderation")
	}
	if !list()["bk-3"]["hidden"].(bool) {
		t.Error("the admin list must flag hidden books")
	}
	// The unrelated books are unaffected.
	e.do(other, "POST", "/api/my/library", map[string]any{"bookId": "bk-1"}).wantStatus(t, 201)

	// Reversible.
	e.do(admin, "PATCH", "/api/admin/catalogue/bk-3", map[string]any{"hidden": false}).wantStatus(t, 200)
	e.do(other, "GET", "/api/books/bk-3", nil).wantStatus(t, 200)
	e.do(other, "POST", "/api/my/library", map[string]any{"bookId": "bk-3"}).wantStatus(t, 201)

	// Validation, authorization and audit.
	e.do(admin, "PATCH", "/api/admin/catalogue/ghost", map[string]any{"hidden": true}).wantStatus(t, 404)
	e.do(admin, "PATCH", "/api/admin/catalogue/bk-3", map[string]any{}).wantStatus(t, 400)
	e.do(admin, "PATCH", "/api/admin/catalogue/bk-3", map[string]any{"hidden": true, "title": "x"}).wantStatus(t, 400)
	e.do(other, "PATCH", "/api/admin/catalogue/bk-3", map[string]any{"hidden": true}).wantStatus(t, 403)
	e.do(admin, "DELETE", "/api/admin/catalogue/bk-3", nil).wantStatus(t, 405) // no destructive operation exists
	actions := strings.Join(e.auditActions(admin), ",")
	if !strings.Contains(actions, "catalogue.hidden") || !strings.Contains(actions, "catalogue.unhidden") {
		t.Errorf("moderation must be audited: %s", actions)
	}
	if n := strings.Count(actions, "catalogue.hidden"); n != 1 {
		t.Errorf("hiding twice must be audited once, got %d", n)
	}
}

func TestAdminMembersListShape(t *testing.T) {
	e := newEnv(t)
	admin, member := newUser(t, "admin"), newUser(t, "member")
	e.makeAdmin(admin)
	e.do(member, "GET", "/api/me", nil).wantStatus(t, 200)

	var found int
	for _, m := range e.do(admin, "GET", "/api/admin/members", nil).wantStatus(t, 200).List {
		if m["email"] == strings.ToLower(admin) || m["email"] == strings.ToLower(member) {
			found++
			for _, k := range []string{"id", "email", "role", "status", "createdAt", "lastSeenAt"} {
				if m[k] == nil {
					t.Errorf("member is missing %s: %v", k, m)
				}
			}
			if _, has := m["cf_subject"]; has || m["cfSubject"] != nil {
				t.Error("the identity-provider subject must not be exposed")
			}
		}
	}
	if found != 2 {
		t.Fatalf("expected both members in the list, found %d", found)
	}
}

func toStrings(v any) []string {
	var out []string
	for _, x := range v.([]any) {
		out = append(out, x.(string))
	}
	return out
}

var _ = catalogue.Book{}
