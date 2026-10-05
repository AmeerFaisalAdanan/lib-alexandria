package api

import (
	"crypto/rand"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"libax/internal/catalogue"
	"libax/internal/domain"
)

type bookInput struct {
	Title           string `json:"title"`
	Author          string `json:"author"`
	ISBN            string `json:"isbn"`
	Publisher       string `json:"publisher"`
	PublicationYear *int   `json:"publicationYear"`
	Language        string `json:"language"`
	Category        string `json:"category"`
}

var isbnRe = regexp.MustCompile(`^(\d{9}[\dX]|\d{13})$`)

func tidy(s string) string { return strings.Join(strings.Fields(s), " ") }

func hasControl(s string) bool {
	for _, r := range s {
		if r < 0x20 || r == 0x7f {
			return true
		}
	}
	return false
}

func limited(field, value string, min, max int) (string, error) {
	v := tidy(value)
	if hasControl(v) {
		return "", domain.Invalid(field, "contains invalid characters")
	}
	if n := utf8.RuneCountInString(v); n < min || n > max {
		if min > 0 {
			return "", domain.Invalid(field, "required, at most %d characters", max)
		}
		return "", domain.Invalid(field, "at most %d characters", max)
	}
	return v, nil
}

// validate turns user input into a catalogue book (without an id).
func (in bookInput) validate(now time.Time) (catalogue.Book, error) {
	var b catalogue.Book
	var err error
	if b.Title, err = limited("title", in.Title, 1, 300); err != nil {
		return b, err
	}
	if b.Author, err = limited("author", in.Author, 1, 300); err != nil {
		return b, err
	}
	if b.Publisher, err = limited("publisher", in.Publisher, 0, 200); err != nil {
		return b, err
	}
	if b.Category, err = limited("category", in.Category, 1, 80); err != nil {
		return b, err
	}
	lang, err := limited("language", in.Language, 1, 50)
	if err != nil {
		return b, err
	}
	b.Language = catalogue.NormaliseLanguage(lang)

	if isbn := catalogue.NormaliseISBN(in.ISBN); isbn != "" {
		if !isbnRe.MatchString(isbn) {
			return b, domain.Invalid("isbn", "must be 10 or 13 digits")
		}
		b.ISBN = isbn
	}
	if in.PublicationYear != nil {
		if y := *in.PublicationYear; y < 1000 || y > now.Year()+1 {
			return b, domain.Invalid("publicationYear", "must be a year from 1000 to %d", now.Year()+1)
		}
		b.PublicationYear = in.PublicationYear
	}
	return b, nil
}

// newBookID makes a permanent catalogue id: "bk-" plus 12 random base-32 characters.
func newBookID() (string, error) {
	const alphabet = "abcdefghjkmnpqrstvwxyz23456789" // no look-alikes (i l o u 0 1)
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, len(buf))
	for i, b := range buf {
		out[i] = alphabet[int(b)%len(alphabet)]
	}
	return "bk-" + string(out), nil
}

// publishBook adds a book to the shared catalogue, visible to everyone straight away.
func (s *server) publishBook(w http.ResponseWriter, r *http.Request) {
	if s.pub == nil {
		writeError(w, http.StatusForbidden, "submissions_disabled", "adding books to the catalogue is turned off", "")
		return
	}
	var in bookInput
	if err := decode(w, r, &in); err != nil {
		fail(w, s.log, err)
		return
	}
	book, err := in.validate(time.Now())
	if err != nil {
		fail(w, s.log, err)
		return
	}
	user := currentUser(r)

	n, err := s.store.CountSubmissions(r.Context(), user.ID, time.Now().Add(-24*time.Hour))
	if err != nil {
		fail(w, s.log, err)
		return
	}
	if n >= s.pubLimit {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "you have added the maximum number of books for today; try again tomorrow", "")
		return
	}

	s.publishMu.Lock()
	defer s.publishMu.Unlock()

	existing, err := s.cat.ListBooks(r.Context())
	if err != nil {
		s.log.Error("catalogue unavailable", "error", err)
		writeError(w, http.StatusServiceUnavailable, "catalogue_unavailable", "the catalogue is temporarily unavailable", "")
		return
	}
	if dup, found := catalogue.FindDuplicate(existing, book); found {
		var b errorBody
		b.Error.Code, b.Error.Message, b.Error.Existing = "duplicate", "this book is already in the catalogue", dup.ID
		writeJSON(w, http.StatusConflict, b)
		return
	}

	taken := make(map[string]bool, len(existing))
	for _, e := range existing {
		taken[e.ID] = true
	}
	for {
		if book.ID, err = newBookID(); err != nil {
			fail(w, s.log, err)
			return
		}
		if !taken[book.ID] {
			break
		}
	}

	if err := s.pub.Publish(r.Context(), book, user.Email); err != nil {
		if errors.Is(err, catalogue.ErrReadOnly) {
			writeError(w, http.StatusForbidden, "submissions_disabled", "adding books to the catalogue is turned off", "")
			return
		}
		s.log.Error("publishing to the catalogue failed", "error", err)
		writeError(w, http.StatusServiceUnavailable, "catalogue_unavailable", "the book could not be saved to the catalogue; please try again", "")
		return
	}
	if err := s.store.RecordSubmission(r.Context(), user.ID, book); err != nil {
		// The book is already published; losing the audit row must not turn a success into a failure.
		s.log.Error("recording submission failed", "error", err, "bookId", book.ID)
	}
	writeJSON(w, http.StatusCreated, book)
}
