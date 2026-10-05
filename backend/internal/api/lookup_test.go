package api_test

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"

	"libax/internal/api"
	"libax/internal/lookup"
)

type stubISBN map[string]lookup.Info

func (s stubISBN) ByISBN(_ context.Context, isbn string) (lookup.Info, bool, error) {
	if isbn == "9781234567897" { // valid checksum, provider is down
		return lookup.Info{}, false, errors.New("providers down")
	}
	i, ok := s[isbn]
	return i, ok, nil
}

type stubCover struct {
	info lookup.Info
	err  error
	got  int
}

func (s *stubCover) Read(_ context.Context, img []byte, mediaType string) (lookup.Info, error) {
	s.got = len(img)
	return s.info, s.err
}

func pngBytes(t *testing.T) []byte {
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	img.Set(1, 1, color.White)
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func withLookup(isbn lookup.ISBNLookup, cover lookup.CoverReader, lookupLimit, coverLimit int) func(*api.Deps) {
	return func(d *api.Deps) {
		d.ISBN, d.Cover, d.LookupLimit, d.CoverScanLimit = isbn, cover, lookupLimit, coverLimit
	}
}

func TestISBNLookupEndpoint(t *testing.T) {
	year := 2008
	isbn := stubISBN{"9780132350884": {Title: "Clean Code", Author: "Robert C. Martin", ISBN: "9780132350884", PublicationYear: &year}}
	e := newEnvWith(t, books, nil, 0, withLookup(isbn, nil, 100, 100))
	u := newUser(t, "a")

	r := e.do(u, "GET", "/api/lookup/isbn/978-0-13-235088-4", nil).wantStatus(t, 200)
	if r.Body["title"] != "Clean Code" || r.Body["publicationYear"] != float64(2008) {
		t.Errorf("body: %v", r.Body)
	}
	e.do(u, "GET", "/api/lookup/isbn/9780306406157", nil).wantStatus(t, 404) // valid, unknown
	e.do(u, "GET", "/api/lookup/isbn/9780306406158", nil).wantStatus(t, 400) // bad check digit
	e.do(u, "GET", "/api/lookup/isbn/hello", nil).wantStatus(t, 400)
	e.do(u, "GET", "/api/lookup/isbn/9781234567897", nil).wantStatus(t, 503) // provider failure
	if me := e.do(u, "GET", "/api/me", nil).wantStatus(t, 200); me.Body["features"].(map[string]any)["isbnLookup"] != true {
		t.Errorf("features: %v", me.Body["features"])
	}
}

func TestISBNLookupDisabledAndRateLimited(t *testing.T) {
	off := newEnv(t)
	u := newUser(t, "a")
	off.do(u, "GET", "/api/lookup/isbn/9780132350884", nil).wantStatus(t, 404)
	if me := off.do(u, "GET", "/api/me", nil); me.Body["features"].(map[string]any)["isbnLookup"] != false {
		t.Errorf("features: %v", me.Body["features"])
	}

	e := newEnvWith(t, books, nil, 0, withLookup(stubISBN{}, nil, 2, 100))
	a, b := newUser(t, "a"), newUser(t, "b")
	e.do(a, "GET", "/api/lookup/isbn/9780132350884", nil).wantStatus(t, 404)
	e.do(a, "GET", "/api/lookup/isbn/9780132350884", nil).wantStatus(t, 404)
	e.do(a, "GET", "/api/lookup/isbn/9780132350884", nil).wantStatus(t, 429)
	e.do(b, "GET", "/api/lookup/isbn/9780132350884", nil).wantStatus(t, 404) // per user
}

func TestCoverScanEndpoint(t *testing.T) {
	cover := &stubCover{info: lookup.Info{Title: "Bidayah Al-Hidayah", Author: "Imam Al-Ghazali", ISBN: "9780132350884"}}
	year := 2008
	isbn := stubISBN{"9780132350884": {Title: "Database title", Author: "Database author", Publisher: "Prentice Hall", PublicationYear: &year}}
	e := newEnvWith(t, books, nil, 0, withLookup(isbn, cover, 100, 100))
	u := newUser(t, "a")
	img := pngBytes(t)

	r := e.doRaw(u, "POST", "/api/lookup/cover", "image/png", img).wantStatus(t, 200)
	if cover.got != len(img) {
		t.Errorf("reader got %d bytes, want %d", cover.got, len(img))
	}
	// A readable ISBN beats reading the print: a one-digit misread is always caught by the check digit,
	// so when the ISBN database knows the book, its record wins and the cover only fills the gaps.
	if r.Body["title"] != "Database title" || r.Body["publisher"] != "Prentice Hall" || r.Body["publicationYear"] != float64(2008) {
		t.Errorf("should be enriched from the ISBN lookup: %v", r.Body)
	}
	if me := e.do(u, "GET", "/api/me", nil); me.Body["features"].(map[string]any)["coverScan"] != true {
		t.Errorf("features: %v", me.Body["features"])
	}
}

func TestCoverScanRejectsBadInput(t *testing.T) {
	cover := &stubCover{info: lookup.Info{Title: "x"}}
	e := newEnvWith(t, books, nil, 0, withLookup(nil, cover, 100, 100))
	u := newUser(t, "a")

	e.doRaw(u, "POST", "/api/lookup/cover", "text/plain", pngBytes(t)).wantStatus(t, 415)
	e.doRaw(u, "POST", "/api/lookup/cover", "image/jpeg", pngBytes(t)).wantStatus(t, 415) // bytes are PNG, header says JPEG
	e.doRaw(u, "POST", "/api/lookup/cover", "image/png", []byte("<html>not an image</html>")).wantStatus(t, 415)
	e.doRaw(u, "POST", "/api/lookup/cover", "image/png", nil).wantStatus(t, 415)
	big := append(pngBytes(t), bytes.Repeat([]byte{0}, 6<<20)...)
	e.doRaw(u, "POST", "/api/lookup/cover", "image/png", big).wantStatus(t, 413)
	if cover.got != 0 {
		t.Error("rejected input must never reach the vision model")
	}
}

func TestCoverScanOutcomes(t *testing.T) {
	img := pngBytes(t)
	u := newUser(t, "a")

	unreadable := &stubCover{err: lookup.ErrUnreadable}
	newEnvWith(t, books, nil, 0, withLookup(nil, unreadable, 100, 100)).doRaw(u, "POST", "/api/lookup/cover", "image/png", img).wantStatus(t, 422)

	down := &stubCover{err: errors.New("anthropic is down")}
	r := newEnvWith(t, books, nil, 0, withLookup(nil, down, 100, 100)).doRaw(u, "POST", "/api/lookup/cover", "image/png", img).wantStatus(t, 503)
	if strings.Contains(r.Raw, "anthropic is down") {
		t.Error("internal error details must not reach the client")
	}

	newEnv(t).doRaw(u, "POST", "/api/lookup/cover", "image/png", img).wantStatus(t, 404) // disabled
}

func TestCoverScanIsRateLimitedPerUser(t *testing.T) {
	cover := &stubCover{info: lookup.Info{Title: "x"}}
	e := newEnvWith(t, books, nil, 0, withLookup(nil, cover, 100, 2))
	a, b := newUser(t, "a"), newUser(t, "b")
	img := pngBytes(t)
	e.doRaw(a, "POST", "/api/lookup/cover", "image/png", img).wantStatus(t, 200)
	e.doRaw(a, "POST", "/api/lookup/cover", "image/png", img).wantStatus(t, 200)
	e.doRaw(a, "POST", "/api/lookup/cover", "image/png", img).wantStatus(t, 429)
	e.doRaw(b, "POST", "/api/lookup/cover", "image/png", img).wantStatus(t, 200)
}
