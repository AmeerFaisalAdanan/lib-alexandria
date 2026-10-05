package api

import (
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"libax/internal/lookup"
)

// maxCoverBytes is the Claude API's per-image limit; the browser downsizes photos well below it.
const maxCoverBytes = 5 << 20

// lookupISBN suggests book details for an ISBN (the barcode on the back of a book).
func (s *server) lookupISBN(w http.ResponseWriter, r *http.Request) {
	if s.isbn == nil {
		writeError(w, http.StatusNotFound, "lookup_disabled", "ISBN lookup is turned off", "")
		return
	}
	isbn := lookup.NormaliseISBN(chi.URLParam(r, "isbn"))
	if !lookup.Valid(isbn) {
		writeError(w, http.StatusBadRequest, "invalid_isbn", "that is not a valid ISBN", "isbn")
		return
	}
	if !s.isbnLimiter.Allow(currentUser(r).ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many lookups today; try again tomorrow", "")
		return
	}
	info, found, err := s.isbn.ByISBN(r.Context(), isbn)
	if err != nil {
		s.log.Error("isbn lookup failed", "error", err)
		writeError(w, http.StatusServiceUnavailable, "lookup_unavailable", "the book lookup is temporarily unavailable", "")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "not_found", "no book found for that ISBN", "")
		return
	}
	writeJSON(w, http.StatusOK, info)
}

var coverTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true, "image/gif": true}

// lookupCover reads a photo of a book cover. The body is the raw image (Content-Type: image/jpeg|png|webp|gif).
func (s *server) lookupCover(w http.ResponseWriter, r *http.Request) {
	if s.cover == nil {
		writeError(w, http.StatusNotFound, "cover_scan_disabled", "scanning a cover photo is turned off", "")
		return
	}
	declared := r.Header.Get("Content-Type")
	if !coverTypes[declared] {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_image", "send a JPEG, PNG, WebP or GIF image", "")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxCoverBytes))
	if err != nil {
		fail(w, s.log, err)
		return
	}
	if len(body) == 0 || http.DetectContentType(body) != declared { // trust the bytes, not the header
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_image", "the file is not a valid "+declared, "")
		return
	}
	if !s.coverLimiter.Allow(currentUser(r).ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many cover scans today; try again tomorrow", "")
		return
	}

	info, err := s.cover.Read(r.Context(), body, declared)
	switch {
	case errors.Is(err, lookup.ErrUnreadable):
		writeError(w, http.StatusUnprocessableEntity, "unreadable", "no book details could be read from that photo", "")
		return
	case err != nil:
		s.log.Error("cover scan failed", "error", err) // never log the image
		writeError(w, http.StatusServiceUnavailable, "scan_unavailable", "cover scanning is temporarily unavailable", "")
		return
	}

	// A readable ISBN is more reliable than the printed title: enrich from the ISBN databases when we can.
	if s.isbn != nil && info.ISBN != "" {
		if found, ok, err := s.isbn.ByISBN(r.Context(), info.ISBN); err == nil && ok {
			info = found.Fill(info)
		}
	}
	writeJSON(w, http.StatusOK, info)
}
