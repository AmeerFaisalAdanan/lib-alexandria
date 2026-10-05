package api_test

import (
	"strings"
	"testing"
	"time"
)

func tomorrow() string { return time.Now().UTC().Add(24 * time.Hour).Format("2006-01-02") }

func userID(t *testing.T, e *env, email string) string {
	t.Helper()
	return e.do(email, "GET", "/api/me", nil).wantStatus(t, 200).Body["id"].(string)
}

func newCopy(t *testing.T, e *env, owner, bookID string, extra map[string]any) string {
	t.Helper()
	body := map[string]any{"bookId": bookID}
	for k, v := range extra {
		body[k] = v
	}
	return e.do(owner, "POST", "/api/copies", body).wantStatus(t, 201).Body["id"].(string)
}

func findCopy(t *testing.T, e *env, viewer, id string) map[string]any {
	t.Helper()
	for _, c := range e.do(viewer, "GET", "/api/copies", nil).wantStatus(t, 200).List {
		if c["id"] == id {
			return c
		}
	}
	t.Fatalf("copy %s not visible to %s", id, viewer)
	return nil
}

func TestOwnerRecordsWhoBoughtACopyAndEveryoneSeesIt(t *testing.T) {
	e := newEnv(t)
	owner, other := newUser(t, "owner"), newUser(t, "other")
	ownerID := userID(t, e, owner)

	// You can own a book without having it on your reading list, and unknown books are refused.
	e.do(owner, "POST", "/api/copies", map[string]any{"bookId": "ghost"}).wantStatus(t, 404)
	e.do(owner, "POST", "/api/copies", map[string]any{}).wantStatus(t, 400)
	id := newCopy(t, e, owner, "bk-1", map[string]any{"price": 49.9, "purchaseDate": "2025-03-01", "location": "Study shelf"})

	mine := findCopy(t, e, owner, id)
	if mine["price"] != 49.9 || mine["purchaseDate"] != "2025-03-01" || mine["location"] != "Study shelf" {
		t.Errorf("owner view: %v", mine)
	}
	if o := mine["owner"].(map[string]any); o["id"] != ownerID || o["email"] != strings.ToLower(owner) {
		t.Errorf("owner: %v", o)
	}
	if mine["loan"] != nil {
		t.Errorf("a new copy is available: %v", mine["loan"])
	}

	// Another member sees who bought it, when and where, but never the price.
	theirs := findCopy(t, e, other, id)
	if theirs["purchaseDate"] != "2025-03-01" || theirs["location"] != "Study shelf" {
		t.Errorf("other view: %v", theirs)
	}
	if _, has := theirs["price"]; has {
		t.Error("price must be private to the owner")
	}
	if theirs["book"].(map[string]any)["title"] != "Ihya Ulum al-Din" {
		t.Errorf("copy should embed the book: %v", theirs)
	}
}

func TestOnlyTheOwnerEditsOrDeletesACopy(t *testing.T) {
	e := newEnv(t)
	owner, other := newUser(t, "owner"), newUser(t, "other")
	id := newCopy(t, e, owner, "bk-1", map[string]any{"price": 10})

	p := e.do(owner, "PATCH", "/api/copies/"+id, map[string]any{"location": "Living room", "price": nil}).wantStatus(t, 200)
	if p.Body["location"] != "Living room" {
		t.Errorf("patch: %v", p.Body)
	}
	if _, has := p.Body["price"]; has {
		t.Error("null price must clear it")
	}

	e.do(other, "PATCH", "/api/copies/"+id, map[string]any{"location": "Mine now"}).wantStatus(t, 403)
	e.do(other, "DELETE", "/api/copies/"+id, nil).wantStatus(t, 403)
	if findCopy(t, e, owner, id)["location"] != "Living room" {
		t.Fatal("another member changed the copy")
	}

	for name, body := range map[string]map[string]any{
		"negative price": {"price": -1},
		"bad date":       {"purchaseDate": "01/03/2025"},
		"long location":  {"location": strings.Repeat("x", 121)},
		"unknown field":  {"ownerId": "x"},
	} {
		if r := e.do(owner, "PATCH", "/api/copies/"+id, body); r.Status != 400 {
			t.Errorf("%s: status %d", name, r.Status)
		}
	}
	e.do(owner, "PATCH", "/api/copies/not-a-uuid", map[string]any{"location": "x"}).wantStatus(t, 404)

	e.do(owner, "DELETE", "/api/copies/"+id, nil).wantStatus(t, 204)
	e.do(owner, "DELETE", "/api/copies/"+id, nil).wantStatus(t, 404)
}

func TestBorrowingAndReturning(t *testing.T) {
	e := newEnv(t)
	owner, borrower, third := newUser(t, "owner"), newUser(t, "borrower"), newUser(t, "third")
	borrowerID := userID(t, e, borrower)
	id := newCopy(t, e, owner, "bk-1", nil)

	// Nobody can borrow their own copy.
	e.do(owner, "POST", "/api/copies/"+id+"/loan", nil).wantStatus(t, 400)

	// A member borrows an available copy for themselves, with a due date.
	loaned := e.do(borrower, "POST", "/api/copies/"+id+"/loan", map[string]any{"dueAt": tomorrow()}).wantStatus(t, 201)
	loan := loaned.Body["loan"].(map[string]any)
	if loan["borrower"].(map[string]any)["id"] != borrowerID || loan["dueAt"] != tomorrow() || loan["borrowedAt"] == "" {
		t.Fatalf("loan: %v", loan)
	}

	// Everyone sees who has it and since when.
	seen := findCopy(t, e, third, id)["loan"].(map[string]any)
	if seen["borrower"].(map[string]any)["email"] != strings.ToLower(borrower) {
		t.Errorf("third party view: %v", seen)
	}

	// One active loan per copy; a copy on loan cannot be deleted.
	e.do(third, "POST", "/api/copies/"+id+"/loan", nil).wantStatus(t, 409)
	e.do(owner, "DELETE", "/api/copies/"+id, nil).wantStatus(t, 409)

	// Only the owner or the borrower can return it.
	e.do(third, "DELETE", "/api/copies/"+id+"/loan", nil).wantStatus(t, 403)
	back := e.do(borrower, "DELETE", "/api/copies/"+id+"/loan", nil).wantStatus(t, 200)
	if back.Body["loan"] != nil {
		t.Errorf("returned copy should be available: %v", back.Body)
	}
	e.do(borrower, "DELETE", "/api/copies/"+id+"/loan", nil).wantStatus(t, 404) // nothing to return

	// It can be borrowed again, and the owner can end the loan too.
	e.do(third, "POST", "/api/copies/"+id+"/loan", nil).wantStatus(t, 201)
	e.do(owner, "DELETE", "/api/copies/"+id+"/loan", nil).wantStatus(t, 200)
}

func TestOwnerCanLendToAnotherMemberButOthersCannotLendForThem(t *testing.T) {
	e := newEnv(t)
	owner, friend, stranger := newUser(t, "owner"), newUser(t, "friend"), newUser(t, "stranger")
	friendID := userID(t, e, friend)
	id := newCopy(t, e, owner, "bk-2", nil)

	// A non-owner cannot lend the copy to someone else (or to anyone but themselves).
	e.do(stranger, "POST", "/api/copies/"+id+"/loan", map[string]any{"borrowerId": friendID}).wantStatus(t, 403)

	lent := e.do(owner, "POST", "/api/copies/"+id+"/loan", map[string]any{"borrowerId": friendID}).wantStatus(t, 201)
	if lent.Body["loan"].(map[string]any)["borrower"].(map[string]any)["id"] != friendID {
		t.Errorf("lent: %v", lent.Body)
	}
	e.do(owner, "DELETE", "/api/copies/"+id+"/loan", nil).wantStatus(t, 200)

	e.do(owner, "POST", "/api/copies/"+id+"/loan", map[string]any{"borrowerId": "not-a-uuid"}).wantStatus(t, 400)
	e.do(owner, "POST", "/api/copies/"+id+"/loan", map[string]any{"borrowerId": "00000000-0000-0000-0000-000000000000"}).wantStatus(t, 404)
	e.do(owner, "POST", "/api/copies/"+id+"/loan", map[string]any{"dueAt": "2001-01-01"}).wantStatus(t, 400) // in the past
	e.do(owner, "POST", "/api/copies/"+id+"/loan", map[string]any{"dueAt": "soon"}).wantStatus(t, 400)
	e.do(owner, "POST", "/api/copies/00000000-0000-0000-0000-000000000000/loan", nil).wantStatus(t, 404)
}

func TestSeveralMembersCanOwnCopiesOfTheSameBook(t *testing.T) {
	e := newEnv(t)
	a, b := newUser(t, "a"), newUser(t, "b")
	ca := newCopy(t, e, a, "bk-3", nil)
	cb := newCopy(t, e, b, "bk-3", nil)
	if ca == cb {
		t.Fatal("copies must be distinct")
	}
	// Each can borrow the other's copy, independently.
	e.do(a, "POST", "/api/copies/"+cb+"/loan", nil).wantStatus(t, 201)
	if findCopy(t, e, b, ca)["loan"] != nil {
		t.Error("a's copy should still be available")
	}
}

func TestUsersDirectory(t *testing.T) {
	e := newEnv(t)
	a := newUser(t, "a")
	userID(t, e, a)
	found := false
	for _, u := range e.do(a, "GET", "/api/users", nil).wantStatus(t, 200).List {
		if u["email"] == strings.ToLower(a) {
			found = true
		}
	}
	if !found {
		t.Error("members should be listed so the owner can pick a borrower")
	}
}

func TestOnlyOneActiveLoanPerCopyIsEnforcedByTheDatabase(t *testing.T) {
	e := newEnv(t)
	owner, b1, b2 := newUser(t, "owner"), newUser(t, "b1"), newUser(t, "b2")
	id := newCopy(t, e, owner, "bk-1", nil)
	e.do(b1, "POST", "/api/copies/"+id+"/loan", nil).wantStatus(t, 201)
	_ = b2

	conn := e.rawConn(t)
	defer conn.Close(t.Context())
	_, err := conn.Exec(t.Context(), `INSERT INTO loans (copy_id, borrower_id) SELECT copy_id, borrower_id FROM loans WHERE copy_id = $1`, id)
	if err == nil {
		t.Fatal("a second active loan for the same copy must be rejected by the database")
	}
}
