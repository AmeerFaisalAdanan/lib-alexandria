package api

import (
	"net/http"
	"time"

	"libax/internal/domain"
	"libax/internal/store"
)

// Copies and loans are shared across the whole library: every signed-in member can see who owns which copy
// and who has it. Only the price stays private to the owner.

func (s *server) listUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.store.ListUsers(r.Context())
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (s *server) listCopies(w http.ResponseWriter, r *http.Request) {
	copies, err := s.store.ListCopies(r.Context(), currentUser(r).ID)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, copies)
}

type createCopyRequest struct {
	BookID string `json:"bookId"`
	copyFields
}

// createCopy records that the caller owns (bought) a copy of a catalogue book.
func (s *server) createCopy(w http.ResponseWriter, r *http.Request) {
	var req createCopyRequest
	if err := decode(w, r, &req); err != nil {
		fail(w, s.log, err)
		return
	}
	if req.BookID == "" {
		fail(w, s.log, domain.Invalid("bookId", "required"))
		return
	}
	book, found, err := s.cat.GetBook(r.Context(), req.BookID)
	if err != nil {
		s.log.Error("catalogue unavailable", "error", err)
		writeError(w, http.StatusServiceUnavailable, "catalogue_unavailable", "the catalogue is temporarily unavailable", "")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "book_not_in_catalogue", "that book is not in the catalogue", "bookId")
		return
	}
	var c store.Copy
	if err := req.copyFields.apply(&c); err != nil {
		fail(w, s.log, err)
		return
	}
	out, err := s.store.CreateCopy(r.Context(), currentUser(r).ID, book, c)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *server) updateCopy(w http.ResponseWriter, r *http.Request) {
	id, ok := collectionIDParam(r)
	if !ok {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	var f copyFields
	if err := decode(w, r, &f); err != nil {
		fail(w, s.log, err)
		return
	}
	out, err := s.store.UpdateCopy(r.Context(), currentUser(r).ID, id, f.apply)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *server) deleteCopy(w http.ResponseWriter, r *http.Request) {
	id, ok := collectionIDParam(r)
	if !ok {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	if err := s.store.DeleteCopy(r.Context(), currentUser(r).ID, id); err != nil {
		fail(w, s.log, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type lendRequest struct {
	// BorrowerID is optional: omitted means "I am borrowing it". Only the owner may name someone else.
	BorrowerID string `json:"borrowerId"`
	DueAt      string `json:"dueAt"`
}

func (s *server) lendCopy(w http.ResponseWriter, r *http.Request) {
	id, ok := collectionIDParam(r)
	if !ok {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	var req lendRequest
	if r.ContentLength != 0 {
		if err := decode(w, r, &req); err != nil {
			fail(w, s.log, err)
			return
		}
	}
	if req.BorrowerID != "" && !uuidRe.MatchString(req.BorrowerID) {
		fail(w, s.log, domain.Invalid("borrowerId", "unknown user"))
		return
	}
	var due *string
	if req.DueAt != "" {
		d, err := time.Parse("2006-01-02", req.DueAt)
		if err != nil {
			fail(w, s.log, domain.Invalid("dueAt", "must be a date as YYYY-MM-DD"))
			return
		}
		if d.Before(time.Now().UTC().Truncate(24 * time.Hour)) {
			fail(w, s.log, domain.Invalid("dueAt", "must not be in the past"))
			return
		}
		due = &req.DueAt
	}
	out, err := s.store.Lend(r.Context(), currentUser(r).ID, id, req.BorrowerID, due)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *server) returnCopy(w http.ResponseWriter, r *http.Request) {
	id, ok := collectionIDParam(r)
	if !ok {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	out, err := s.store.Return(r.Context(), currentUser(r).ID, id)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}
