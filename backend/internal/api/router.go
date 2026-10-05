// Package api is the HTTP layer. It deliberately emits no CORS headers: the browser only talks to the
// Next.js origin, which proxies /api/* to this service over the internal network.
package api

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"libax/internal/auth"
	"libax/internal/catalogue"
	"libax/internal/domain"
	"libax/internal/lookup"
	"libax/internal/store"
)

type Deps struct {
	Store     *store.Store
	Catalogue catalogue.Repository
	Auth      func(http.Handler) http.Handler
	AuthMode  string // "cloudflare" or "dev"; reported by /api/me so the UI can adapt
	Log       *slog.Logger

	// Publisher lets users add books to the shared catalogue; nil disables the feature.
	Publisher       catalogue.Publisher
	SubmissionLimit int // books one user may publish per rolling 24h

	// ISBN and Cover fill the new-book form from a barcode or a cover photo; nil disables each.
	ISBN           lookup.ISBNLookup
	Cover          lookup.CoverReader
	LookupLimit    int // ISBN lookups per user per day
	CoverScanLimit int // cover scans per user per day
}

type server struct {
	store    *store.Store
	cat      catalogue.Repository
	authMode string
	log      *slog.Logger

	pub       catalogue.Publisher
	pubLimit  int
	publishMu sync.Mutex // makes "check for duplicates, then append" atomic within this process

	isbn         lookup.ISBNLookup
	cover        lookup.CoverReader
	isbnLimiter  *lookup.Limiter
	coverLimiter *lookup.Limiter
}

func NewRouter(d Deps) http.Handler {
	s := &server{store: d.Store, cat: d.Catalogue, authMode: d.AuthMode, log: d.Log, pub: d.Publisher, pubLimit: d.SubmissionLimit,
		isbn: d.ISBN, cover: d.Cover,
		isbnLimiter:  &lookup.Limiter{Max: max(d.LookupLimit, 1), Window: 24 * time.Hour},
		coverLimiter: &lookup.Limiter{Max: max(d.CoverScanLimit, 1), Window: 24 * time.Hour}}
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.Recoverer, requestLog(d.Log), middleware.Timeout(20*time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, req *http.Request) {
		ctx, cancel := context.WithTimeout(req.Context(), 3*time.Second)
		defer cancel()
		if err := s.store.Ping(ctx); err != nil {
			writeError(w, http.StatusServiceUnavailable, "unavailable", "database unavailable", "")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(r chi.Router) {
		r.Use(d.Auth)

		r.Get("/me", s.me)

		r.Get("/books", s.listBooks)
		r.Post("/books", s.publishBook)
		r.Get("/books/{id}", s.getBook)

		r.Get("/my/library", s.listLibrary)
		r.Post("/my/library", s.addToLibrary)
		r.Get("/my/library/{bookId}", s.getLibraryEntry)
		r.Patch("/my/library/{bookId}", s.updateLibraryEntry)
		r.Delete("/my/library/{bookId}", s.removeFromLibrary)

		r.Get("/lookup/isbn/{isbn}", s.lookupISBN)
		r.Post("/lookup/cover", s.lookupCover)

		r.Get("/users", s.listUsers)

		r.Get("/copies", s.listCopies)
		r.Post("/copies", s.createCopy)
		r.Patch("/copies/{id}", s.updateCopy)
		r.Delete("/copies/{id}", s.deleteCopy)
		r.Post("/copies/{id}/loan", s.lendCopy)
		r.Delete("/copies/{id}/loan", s.returnCopy)

		r.Get("/collections", s.listCollections)
		r.Post("/collections", s.createCollection)
		r.Patch("/collections/{id}", s.updateCollection)
		r.Delete("/collections/{id}", s.deleteCollection)
		r.Put("/collections/{id}/books/{bookId}", s.addCollectionBook)
		r.Delete("/collections/{id}/books/{bookId}", s.removeCollectionBook)
	})

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "not found", "")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed", "")
	})
	return r
}

// requestLog logs method, path, status and duration. It never logs headers, cookies or bodies.
func requestLog(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			start := time.Now()
			next.ServeHTTP(ww, r)
			log.Info("request", "method", r.Method, "path", r.URL.Path, "status", ww.Status(), "ms", time.Since(start).Milliseconds())
		})
	}
}

func currentUser(r *http.Request) auth.User {
	u, _ := auth.UserFrom(r.Context())
	return u
}

// ---------------------------------------------------------------- identity + catalogue

func (s *server) me(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	type features struct {
		ISBNLookup bool `json:"isbnLookup"`
		CoverScan  bool `json:"coverScan"`
	}
	writeJSON(w, http.StatusOK, struct {
		store.User
		AuthMode   string   `json:"authMode"`
		CanAddBook bool     `json:"canAddBooks"`
		Features   features `json:"features"`
	}{store.User{ID: u.ID, Email: u.Email, Name: u.Name}, s.authMode, s.pub != nil, features{s.isbn != nil, s.cover != nil}})
}

func (s *server) listBooks(w http.ResponseWriter, r *http.Request) {
	books, err := s.cat.ListBooks(r.Context())
	if err != nil {
		s.log.Error("catalogue unavailable", "error", err)
		writeError(w, http.StatusServiceUnavailable, "catalogue_unavailable", "the catalogue is temporarily unavailable", "")
		return
	}
	writeJSON(w, http.StatusOK, books)
}

func (s *server) getBook(w http.ResponseWriter, r *http.Request) {
	b, ok, err := s.cat.GetBook(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		s.log.Error("catalogue unavailable", "error", err)
		writeError(w, http.StatusServiceUnavailable, "catalogue_unavailable", "the catalogue is temporarily unavailable", "")
		return
	}
	if !ok {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	writeJSON(w, http.StatusOK, b)
}

// ---------------------------------------------------------------- personal library

func bookIDParam(r *http.Request) (string, bool) {
	id := chi.URLParam(r, "bookId")
	return id, id != "" && utf8.RuneCountInString(id) <= 200
}

func (s *server) listLibrary(w http.ResponseWriter, r *http.Request) {
	entries, err := s.store.ListEntries(r.Context(), currentUser(r).ID)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

func (s *server) getLibraryEntry(w http.ResponseWriter, r *http.Request) {
	id, ok := bookIDParam(r)
	if !ok {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	e, err := s.store.GetEntry(r.Context(), currentUser(r).ID, id)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, e)
}

type addRequest struct {
	BookID string `json:"bookId"`
	entryFields
}

func (s *server) addToLibrary(w http.ResponseWriter, r *http.Request) {
	var req addRequest
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

	e := store.Entry{Status: domain.StatusWantToRead, Tags: []string{}}
	if err := req.entryFields.apply(&e); err != nil {
		fail(w, s.log, err)
		return
	}
	out, err := s.store.AddEntry(r.Context(), currentUser(r).ID, book, e)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *server) updateLibraryEntry(w http.ResponseWriter, r *http.Request) {
	id, ok := bookIDParam(r)
	if !ok {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	var f entryFields
	if err := decode(w, r, &f); err != nil {
		fail(w, s.log, err)
		return
	}
	out, err := s.store.UpdateEntry(r.Context(), currentUser(r).ID, id, f.apply)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *server) removeFromLibrary(w http.ResponseWriter, r *http.Request) {
	id, ok := bookIDParam(r)
	if !ok {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	if err := s.store.DeleteEntry(r.Context(), currentUser(r).ID, id); err != nil {
		fail(w, s.log, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------- collections

func collectionIDParam(r *http.Request) (string, bool) {
	id := chi.URLParam(r, "id")
	return id, uuidRe.MatchString(id)
}

func (s *server) listCollections(w http.ResponseWriter, r *http.Request) {
	cols, err := s.store.ListCollections(r.Context(), currentUser(r).ID)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, cols)
}

func (s *server) createCollection(w http.ResponseWriter, r *http.Request) {
	var f collectionFields
	if err := decode(w, r, &f); err != nil {
		fail(w, s.log, err)
		return
	}
	if !f.Name.Set {
		fail(w, s.log, domain.Invalid("name", "required, at most 80 characters"))
		return
	}
	c := store.Collection{Color: "amber"}
	if err := f.apply(&c); err != nil {
		fail(w, s.log, err)
		return
	}
	out, err := s.store.CreateCollection(r.Context(), currentUser(r).ID, c)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *server) updateCollection(w http.ResponseWriter, r *http.Request) {
	id, ok := collectionIDParam(r)
	if !ok {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	var f collectionFields
	if err := decode(w, r, &f); err != nil {
		fail(w, s.log, err)
		return
	}
	out, err := s.store.UpdateCollection(r.Context(), currentUser(r).ID, id, f.apply)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *server) deleteCollection(w http.ResponseWriter, r *http.Request) {
	id, ok := collectionIDParam(r)
	if !ok {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	if err := s.store.DeleteCollection(r.Context(), currentUser(r).ID, id); err != nil {
		fail(w, s.log, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) addCollectionBook(w http.ResponseWriter, r *http.Request) {
	id, ok1 := collectionIDParam(r)
	bookID, ok2 := bookIDParam(r)
	if !ok1 || !ok2 {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	out, err := s.store.AddCollectionBook(r.Context(), currentUser(r).ID, id, bookID)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *server) removeCollectionBook(w http.ResponseWriter, r *http.Request) {
	id, ok1 := collectionIDParam(r)
	bookID, ok2 := bookIDParam(r)
	if !ok1 || !ok2 {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	out, err := s.store.RemoveCollectionBook(r.Context(), currentUser(r).ID, id, bookID)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}
