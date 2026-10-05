package lookup

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestISBNValidation(t *testing.T) {
	valid := []string{"9780306406157", "9780132350884", "0306406152", "080442957X"}
	for _, s := range valid {
		if !Valid(s) {
			t.Errorf("%s should be valid", s)
		}
	}
	invalid := []string{"", "123", "9780306406158" /* bad check digit */, "0306406153", "080442957Y", "9770306406157" /* not 978/979 */, "97803064061X7", "abcdefghij"}
	for _, s := range invalid {
		if Valid(s) {
			t.Errorf("%q should be invalid", s)
		}
	}
	if got := To13("0306406152"); got != "9780306406157" {
		t.Errorf("To13 = %s", got)
	}
	if got := To13("080442957X"); !Valid(got) {
		t.Errorf("converted ISBN-10 with X is not valid: %s", got)
	}
	if NormaliseISBN(" 978-0-306 40615-7 ") != "9780306406157" || NormaliseISBN("080442957x") != "080442957X" {
		t.Error("NormaliseISBN")
	}
}

func TestInfoCleanTreatsInputAsUntrusted(t *testing.T) {
	year := 1850
	bad := Info{Title: "  A\x00 very\n\tspaced   title ", Author: strings.Repeat("é", 400), ISBN: "0306406152", PublicationYear: &year, Language: "ms", Category: "\x07"}
	got := bad.Clean(time.Now())
	if got.Title != "A very spaced title" {
		t.Errorf("title = %q", got.Title)
	}
	if n := len([]rune(got.Author)); n != 300 {
		t.Errorf("author not clamped: %d", n)
	}
	if got.ISBN != "9780306406157" || got.Language != "Bahasa Melayu" || got.Category != "" {
		t.Errorf("clean: %+v", got)
	}
	future := time.Now().Year() + 5
	if (Info{PublicationYear: &future}).Clean(time.Now()).PublicationYear != nil {
		t.Error("an implausible year should be dropped")
	}
	if (Info{ISBN: "9780306406158"}).Clean(time.Now()).ISBN != "" {
		t.Error("an invalid ISBN should be dropped")
	}
}

func fakeOpenLibrary(t *testing.T, hits *atomic.Int32) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if r.URL.Query().Get("bibkeys") == "ISBN:9780132350884" {
			_, _ = io.WriteString(w, `{"ISBN:9780132350884":{"title":"Clean Code","subtitle":"A Handbook","authors":[{"name":"Robert C. Martin"}],"publishers":[{"name":"Prentice Hall"}],"publish_date":"August 11, 2008"}}`)
			return
		}
		_, _ = io.WriteString(w, `{}`)
	}))
}

func TestGoogleBooksSendsTheKeyWhenConfigured(t *testing.T) {
	var gotKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.URL.Query().Get("key")
		_, _ = io.WriteString(w, `{"totalItems":0}`)
	}))
	defer srv.Close()
	_, _, _ = GoogleBooks{Client: srv.Client(), BaseURL: srv.URL, APIKey: "k&y"}.ByISBN(context.Background(), "9780132350884")
	if gotKey != "k&y" {
		t.Errorf("key = %q", gotKey)
	}
	_, _, _ = GoogleBooks{Client: srv.Client(), BaseURL: srv.URL}.ByISBN(context.Background(), "9780132350884")
	if gotKey != "" {
		t.Errorf("no key configured, but %q was sent", gotKey)
	}
}

func fakeGoogle(t *testing.T) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Query().Get("q"), "9780132350884") {
			_, _ = io.WriteString(w, `{"items":[{"volumeInfo":{"title":"Something else","authors":["Someone"],"publisher":"Other","publishedDate":"2009","language":"en","categories":["Computers"]}}]}`)
			return
		}
		_, _ = io.WriteString(w, `{"totalItems":0}`)
	}))
}

func TestChainMergesProvidersAndCaches(t *testing.T) {
	var olHits atomic.Int32
	ol, g := fakeOpenLibrary(t, &olHits), fakeGoogle(t)
	defer ol.Close()
	defer g.Close()
	chain := &Chain{Log: slog.New(slog.DiscardHandler), Providers: []ISBNLookup{
		OpenLibrary{Client: ol.Client(), BaseURL: ol.URL}, GoogleBooks{Client: g.Client(), BaseURL: g.URL},
	}}

	info, found, err := chain.ByISBN(context.Background(), "978-0-13-235088-4")
	if err != nil || !found {
		t.Fatalf("found=%v err=%v", found, err)
	}
	// The first provider wins on conflicts; the second fills the gaps (language, category).
	if info.Title != "Clean Code: A Handbook" || info.Author != "Robert C. Martin" || info.Publisher != "Prentice Hall" {
		t.Errorf("first provider should win: %+v", info)
	}
	if info.PublicationYear == nil || *info.PublicationYear != 2008 || info.Language != "English" || info.Category != "Computers" || info.ISBN != "9780132350884" {
		t.Errorf("gaps should be filled from the second provider: %+v", info)
	}

	for range 3 {
		if _, ok, _ := chain.ByISBN(context.Background(), "9780132350884"); !ok {
			t.Fatal("cached answer lost")
		}
	}
	if olHits.Load() != 1 {
		t.Errorf("repeat lookups must come from the cache, provider hit %d times", olHits.Load())
	}

	// An unknown ISBN is a clean "not found", also cached.
	if _, ok, err := chain.ByISBN(context.Background(), "9780306406157"); ok || err != nil {
		t.Errorf("unknown: ok=%v err=%v", ok, err)
	}
	before := olHits.Load()
	_, _, _ = chain.ByISBN(context.Background(), "9780306406157")
	if olHits.Load() != before {
		t.Error("a miss should be cached too")
	}

	// ISBN-10 input is converted.
	if _, _, err := chain.ByISBN(context.Background(), "0306406152"); err != nil {
		t.Error(err)
	}
	if _, _, err := chain.ByISBN(context.Background(), "not-an-isbn"); err == nil {
		t.Error("invalid ISBN must be rejected before any network call")
	}
}

func TestChainSurvivesOneProviderFailingButNotAll(t *testing.T) {
	var hits atomic.Int32
	ol, g := fakeOpenLibrary(t, &hits), fakeGoogle(t)
	defer g.Close()
	ol.Close() // Open Library is down
	chain := &Chain{Log: slog.New(slog.DiscardHandler), Providers: []ISBNLookup{
		OpenLibrary{Client: http.DefaultClient, BaseURL: ol.URL}, GoogleBooks{Client: g.Client(), BaseURL: g.URL},
	}}
	if info, ok, err := chain.ByISBN(context.Background(), "9780132350884"); err != nil || !ok || info.Title != "Something else" {
		t.Fatalf("one provider down should still answer: %+v %v %v", info, ok, err)
	}

	g.Close()
	dead := &Chain{Log: slog.New(slog.DiscardHandler), Providers: []ISBNLookup{OpenLibrary{Client: http.DefaultClient, BaseURL: ol.URL}, GoogleBooks{Client: http.DefaultClient, BaseURL: g.URL}}}
	if _, ok, err := dead.ByISBN(context.Background(), "9780132350884"); ok || err == nil {
		t.Fatalf("every provider failing must be an error, not 'not found' (ok=%v err=%v)", ok, err)
	}
	if len(dead.cache) != 0 {
		t.Error("failures must not be cached")
	}
}

func TestAMissIsNotCachedWhileAProviderIsFailing(t *testing.T) {
	var hits atomic.Int32
	ol := fakeOpenLibrary(t, &hits) // knows nothing about this ISBN
	defer ol.Close()
	rateLimited := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTooManyRequests) }))
	defer rateLimited.Close()
	chain := &Chain{Log: slog.New(slog.DiscardHandler), Providers: []ISBNLookup{
		OpenLibrary{Client: ol.Client(), BaseURL: ol.URL}, GoogleBooks{Client: rateLimited.Client(), BaseURL: rateLimited.URL},
	}}

	// Open Library says "unknown" but Google Books is rate limited: we cannot claim the book does not exist.
	if _, found, err := chain.ByISBN(context.Background(), "9789810492830"); found || err == nil {
		t.Fatalf("a failing provider must make the answer a temporary error, not 'not found' (found=%v err=%v)", found, err)
	}
	if len(chain.cache) != 0 {
		t.Fatal("that answer must not be cached")
	}
	first := hits.Load()
	_, _, _ = chain.ByISBN(context.Background(), "9789810492830")
	if hits.Load() == first {
		t.Error("the next attempt must ask the providers again")
	}
}

func TestLimiter(t *testing.T) {
	now := time.Now()
	l := &Limiter{Max: 2, Window: time.Hour, now: func() time.Time { return now }}
	if !l.Allow("a") || !l.Allow("a") || l.Allow("a") {
		t.Fatal("third call within the window must be refused")
	}
	if !l.Allow("b") {
		t.Fatal("limits are per key")
	}
	now = now.Add(61 * time.Minute)
	if !l.Allow("a") {
		t.Fatal("the window should have rolled over")
	}
}

// ---------------------------------------------------------------- cover reader (fake Messages API)

func fakeMessagesAPI(t *testing.T, status int, body string, seen *map[string]any) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" || r.Method != http.MethodPost {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if seen != nil {
			raw, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(raw, seen)
			if r.Header.Get("x-api-key") != "test-key" {
				t.Errorf("api key header = %q", r.Header.Get("x-api-key"))
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
}

func message(text, stop string) string {
	t, _ := json.Marshal(text)
	return `{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5-5","content":[{"type":"text","text":` + string(t) + `}],"stop_reason":"` + stop + `","usage":{"input_tokens":10,"output_tokens":10}}`
}

func TestCoverReaderSendsTheImageAndParsesStructuredOutput(t *testing.T) {
	var seen map[string]any
	srv := fakeMessagesAPI(t, 200, message(`{"title":"  Bidayah\u0000 Al-Hidayah ","author":"Imam Al-Ghazali","publisher":"Telaga Biru","isbn":"978-0-306-40615-7","language":"Bahasa Melayu"}`, "end_turn"), &seen)
	defer srv.Close()

	info, err := NewAnthropic("test-key", "claude-opus-5-5", srv.URL).Read(context.Background(), []byte("\x89PNG fake"), "image/png")
	if err != nil {
		t.Fatal(err)
	}
	if info.Title != "Bidayah Al-Hidayah" || info.Author != "Imam Al-Ghazali" || info.Language != "Bahasa Melayu" || info.ISBN != "9780306406157" {
		t.Errorf("parsed: %+v", info)
	}

	// The request must carry the image, the schema, low effort, and the right model.
	if seen["model"] != "claude-opus-5-5" {
		t.Errorf("model = %v", seen["model"])
	}
	cfg := seen["output_config"].(map[string]any)
	if cfg["effort"] != "low" || cfg["format"].(map[string]any)["type"] != "json_schema" {
		t.Errorf("output_config = %v", cfg)
	}
	if _, has := seen["thinking"]; has {
		t.Error("thinking must be left unset (it cannot be disabled on this model)")
	}
	content := seen["messages"].([]any)[0].(map[string]any)["content"].([]any)
	img := content[0].(map[string]any)
	if img["type"] != "image" || img["source"].(map[string]any)["media_type"] != "image/png" || img["source"].(map[string]any)["data"] == "" {
		t.Errorf("image block = %v", img)
	}
	if schema := cfg["format"].(map[string]any)["schema"].(map[string]any); schema["additionalProperties"] != false {
		t.Errorf("schema must be closed: %v", schema)
	}
}

func TestCoverReaderUnreadableAndFailures(t *testing.T) {
	cases := map[string]struct {
		status int
		body   string
		want   error
	}{
		"empty title":  {200, message(`{"title":"","author":"","publisher":"","isbn":"","language":"Other"}`, "end_turn"), ErrUnreadable},
		"refusal":      {200, message(`{}`, "refusal"), ErrUnreadable},
		"not json":     {200, message(`I cannot read that`, "end_turn"), nil},
		"server error": {500, `{"type":"error","error":{"type":"api_error","message":"boom"}}`, nil},
	}
	for name, c := range cases {
		srv := fakeMessagesAPI(t, c.status, c.body, nil)
		_, err := NewAnthropic("test-key", "claude-opus-5-5", srv.URL).Read(context.Background(), []byte("x"), "image/png")
		srv.Close()
		if err == nil {
			t.Errorf("%s: expected an error", name)
		} else if c.want != nil && !errors.Is(err, c.want) {
			t.Errorf("%s: got %v want %v", name, err, c.want)
		}
	}
}

func TestFixtureIsDeterministic(t *testing.T) {
	info, ok, _ := Fixture{}.ByISBN(context.Background(), "9780132350884")
	if !ok || !strings.HasPrefix(info.Title, "Clean Code") || info.ISBN != "9780132350884" {
		t.Errorf("%+v", info)
	}
	for isbn := range fixtureBooks {
		if !Valid(isbn) {
			t.Errorf("fixture ISBN %s fails its own checksum", isbn)
		}
	}
}
