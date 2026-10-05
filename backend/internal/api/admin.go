package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"libax/internal/auth"
	"libax/internal/catalogue"
	"libax/internal/domain"
	"libax/internal/health"
	"libax/internal/store"
)

// requireAdmin lets a request through only if the member resolved from the verified identity is an active
// administrator. The role comes from the database (see auth.User), never from the request.
func requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if u, ok := auth.UserFrom(r.Context()); !ok || !u.IsAdmin() {
			writeError(w, http.StatusForbidden, "forbidden", "administrator access is required", "")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *server) adminListMembers(w http.ResponseWriter, r *http.Request) {
	members, err := s.store.ListMembers(r.Context())
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, members)
}

type memberChange struct {
	Role   *string `json:"role"`
	Status *string `json:"status"`
}

// adminUpdateMember changes a member's role and/or status. There is deliberately no delete: disable instead.
func (s *server) adminUpdateMember(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !uuidRe.MatchString(id) {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	var in memberChange
	if err := decode(w, r, &in); err != nil {
		fail(w, s.log, err)
		return
	}
	if in.Role == nil && in.Status == nil {
		fail(w, s.log, domain.Invalid("body", "give a role and/or a status"))
		return
	}
	if in.Role != nil && *in.Role != store.RoleMember && *in.Role != store.RoleAdmin {
		fail(w, s.log, domain.Invalid("role", "must be member or admin"))
		return
	}
	if in.Status != nil && *in.Status != store.StatusActive && *in.Status != store.StatusDisabled {
		fail(w, s.log, domain.Invalid("status", "must be active or disabled"))
		return
	}
	// The actor is the authenticated administrator; nothing in the body can name or change that.
	m, err := s.store.UpdateMember(r.Context(), currentUser(r).ID, id, store.MemberChange{Role: in.Role, Status: in.Status})
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// adminSystem reports configuration and service status. It contains status words only: no keys, URLs, tokens,
// connection strings or probe error text.
func (s *server) adminSystem(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, struct {
		Services    []health.Result `json:"services"`
		Environment SystemInfo      `json:"environment"`
	}{health.Run(r.Context(), s.log, s.health), s.info})
}

func (s *server) adminAudit(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
		limit = min(v, 200)
	}
	events, err := s.store.ListAudit(r.Context(), limit)
	if err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, events)
}

// adminBook is a catalogue record with what administrators need to judge it.
type adminBook struct {
	catalogue.Book
	Hidden      bool     `json:"hidden"`
	SubmittedBy string   `json:"submittedBy,omitempty"`
	Readers     int      `json:"readers"`
	Copies      int      `json:"copies"`
	Issues      []string `json:"issues"`
}

// adminCatalogue lists every catalogue record (including hidden ones) with simple data-quality flags.
func (s *server) adminCatalogue(w http.ResponseWriter, r *http.Request) {
	books, err := s.cat.ListBooks(r.Context())
	if err != nil {
		s.log.Error("catalogue unavailable", "error", err)
		writeError(w, http.StatusServiceUnavailable, "catalogue_unavailable", "the catalogue is temporarily unavailable", "")
		return
	}
	hidden, err := s.store.HiddenBookIDs(r.Context())
	if err != nil {
		fail(w, s.log, err)
		return
	}
	stats, err := s.store.BookStats(r.Context())
	if err != nil {
		fail(w, s.log, err)
		return
	}

	byTitle, byISBN := map[string]int{}, map[string]int{}
	for _, b := range books {
		byTitle[catalogue.TitleAuthorKey(b)]++
		if isbn := catalogue.NormaliseISBN(b.ISBN); isbn != "" {
			byISBN[isbn]++
		}
	}
	out := make([]adminBook, 0, len(books))
	for _, b := range books {
		st := stats[b.ID]
		ab := adminBook{Book: b, Hidden: hidden[b.ID], SubmittedBy: st.SubmittedBy, Readers: st.Readers, Copies: st.Copies, Issues: []string{}}
		isbn := catalogue.NormaliseISBN(b.ISBN)
		if isbn == "" {
			ab.Issues = append(ab.Issues, "missing_isbn")
		}
		if byTitle[catalogue.TitleAuthorKey(b)] > 1 || (isbn != "" && byISBN[isbn] > 1) {
			ab.Issues = append(ab.Issues, "possible_duplicate")
		}
		out = append(out, ab)
	}
	writeJSON(w, http.StatusOK, out)
}

type hideRequest struct {
	Hidden *bool `json:"hidden"`
}

// adminSetBookHidden hides or restores a book for members. It is soft and reversible and never touches the sheet.
func (s *server) adminSetBookHidden(w http.ResponseWriter, r *http.Request) {
	id, ok := bookIDParam(r)
	if !ok {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	var in hideRequest
	if err := decode(w, r, &in); err != nil {
		fail(w, s.log, err)
		return
	}
	if in.Hidden == nil {
		fail(w, s.log, domain.Invalid("hidden", "required"))
		return
	}
	book, found, err := s.cat.GetBook(r.Context(), id)
	if err != nil {
		s.log.Error("catalogue unavailable", "error", err)
		writeError(w, http.StatusServiceUnavailable, "catalogue_unavailable", "the catalogue is temporarily unavailable", "")
		return
	}
	if !found {
		fail(w, s.log, store.ErrNotFound)
		return
	}
	if _, err := s.store.SetBookHidden(r.Context(), currentUser(r).ID, book, *in.Hidden); err != nil {
		fail(w, s.log, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "hidden": *in.Hidden})
}
