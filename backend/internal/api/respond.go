package api

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"regexp"

	"libax/internal/domain"
	"libax/internal/store"
)

const maxBody = 1 << 20

type errorBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Field   string `json:"field,omitempty"`
		// Existing is the id of the catalogue book that a rejected duplicate collides with.
		Existing string `json:"existing,omitempty"`
	} `json:"error"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message, field string) {
	var b errorBody
	b.Error.Code, b.Error.Message, b.Error.Field = code, message, field
	writeJSON(w, status, b)
}

// fail maps domain/store errors to HTTP responses. Unknown errors are logged and reported as 500.
func fail(w http.ResponseWriter, log *slog.Logger, err error) {
	var ve *domain.ValidationError
	var mbe *http.MaxBytesError
	switch {
	case errors.As(err, &ve):
		writeError(w, http.StatusBadRequest, "invalid_request", ve.Message, ve.Field)
	case errors.As(err, &mbe):
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", "request body too large", "")
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "not found", "")
	case errors.Is(err, store.ErrBookNotInLibrary):
		writeError(w, http.StatusNotFound, "book_not_in_library", err.Error(), "")
	case errors.Is(err, store.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "you are not allowed to do that", "")
	case errors.Is(err, store.ErrOnLoan):
		writeError(w, http.StatusConflict, "on_loan", "this copy is already on loan", "")
	case errors.Is(err, store.ErrNotOnLoan):
		writeError(w, http.StatusNotFound, "not_on_loan", "this copy is not on loan", "")
	case errors.Is(err, store.ErrOwnCopy):
		writeError(w, http.StatusBadRequest, "own_copy", "owners cannot borrow their own copy", "borrowerId")
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, "conflict", "already in your library", "")
	default:
		log.Error("request failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal", "internal error", "")
	}
}

// decode reads a JSON body strictly: unknown fields and trailing data are rejected.
func decode(w http.ResponseWriter, r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return err
		}
		return domain.Invalid("body", "invalid JSON body")
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return domain.Invalid("body", "unexpected data after JSON body")
	}
	return nil
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// Field distinguishes "absent" from "null" from a value in PATCH bodies.
type Field[T any] struct {
	Set  bool
	Null bool
	Val  T
}

func (f *Field[T]) UnmarshalJSON(b []byte) error {
	f.Set = true
	if string(b) == "null" {
		f.Null = true
		return nil
	}
	return json.Unmarshal(b, &f.Val)
}
