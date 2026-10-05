package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	testAUD = "aud-tag-123"
	testKID = "key-1"
)

type cfFixture struct {
	srv  *httptest.Server
	key  *rsa.PrivateKey
	auth *Cloudflare
}

func newCF(t *testing.T) *cfFixture {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/cdn-cgi/access/certs", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kid": testKID, "kty": "RSA", "alg": "RS256", "use": "sig",
			"n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		}}})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return &cfFixture{srv: srv, key: key, auth: NewCloudflare(srv.URL, testAUD, srv.Client())}
}

func (f *cfFixture) token(t *testing.T, mutate func(jwt.MapClaims)) string {
	t.Helper()
	claims := jwt.MapClaims{
		"iss": f.srv.URL, "aud": []string{testAUD}, "sub": "user-uuid-1", "email": "ada@example.com",
		"exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(),
	}
	if mutate != nil {
		mutate(claims)
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = testKID
	s, err := tok.SignedString(f.key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func req(token string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	if token != "" {
		r.Header.Set("Cf-Access-Jwt-Assertion", token)
	}
	return r
}

func TestCloudflareAcceptsValidToken(t *testing.T) {
	f := newCF(t)
	id, err := f.auth.Authenticate(req(f.token(t, nil)))
	if err != nil {
		t.Fatal(err)
	}
	if id.Subject != "cf:user-uuid-1" || id.Email != "ada@example.com" {
		t.Errorf("unexpected identity %+v", id)
	}
}

func TestCloudflareAcceptsCookie(t *testing.T) {
	f := newCF(t)
	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	r.AddCookie(&http.Cookie{Name: "CF_Authorization", Value: f.token(t, nil)})
	if _, err := f.auth.Authenticate(r); err != nil {
		t.Fatal(err)
	}
}

func TestCloudflareRejectsBadTokens(t *testing.T) {
	f := newCF(t)
	other, _ := rsa.GenerateKey(rand.Reader, 2048)

	forged := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": f.srv.URL, "aud": []string{testAUD}, "sub": "x", "email": "evil@example.com", "exp": time.Now().Add(time.Hour).Unix(),
	})
	forged.Header["kid"] = testKID
	forgedStr, _ := forged.SignedString(other)

	hs := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"iss": f.srv.URL, "aud": []string{testAUD}, "sub": "x", "email": "evil@example.com", "exp": time.Now().Add(time.Hour).Unix(),
	})
	hs.Header["kid"] = testKID
	hsStr, _ := hs.SignedString([]byte("secret"))

	none := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{
		"iss": f.srv.URL, "aud": []string{testAUD}, "sub": "x", "email": "evil@example.com", "exp": time.Now().Add(time.Hour).Unix(),
	})
	noneStr, _ := none.SignedString(jwt.UnsafeAllowNoneSignatureType)

	cases := map[string]string{
		"missing token":     "",
		"garbage":           "not-a-jwt",
		"wrong signing key": forgedStr,
		"HS256 confusion":   hsStr,
		"alg none":          noneStr,
		"wrong audience":    f.token(t, func(c jwt.MapClaims) { c["aud"] = []string{"someone-else"} }),
		"wrong issuer":      f.token(t, func(c jwt.MapClaims) { c["iss"] = "https://evil.example.com" }),
		"expired":           f.token(t, func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Hour).Unix() }),
		"no exp":            f.token(t, func(c jwt.MapClaims) { delete(c, "exp") }),
		"no subject":        f.token(t, func(c jwt.MapClaims) { delete(c, "sub") }),
		"no email":          f.token(t, func(c jwt.MapClaims) { delete(c, "email") }),
	}
	for name, tok := range cases {
		if _, err := f.auth.Authenticate(req(tok)); err == nil {
			t.Errorf("%s: token must be rejected", name)
		}
	}
}

func TestCloudflareServiceTokenUsesCommonName(t *testing.T) {
	f := newCF(t)
	id, err := f.auth.Authenticate(req(f.token(t, func(c jwt.MapClaims) {
		delete(c, "email")
		c["common_name"] = "svc-client-id.access"
	})))
	if err != nil || id.Email != "svc-client-id.access" {
		t.Fatalf("id=%+v err=%v", id, err)
	}
}

func TestDevRefusedInProduction(t *testing.T) {
	if _, err := NewDev("production", "dev@example.test"); err == nil {
		t.Fatal("dev auth must not be constructible in production")
	}
	d, err := NewDev("development", "dev@example.test")
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("X-Dev-User", "Bob@Example.test")
	id, _ := d.Authenticate(r)
	if id.Subject != "dev:bob@example.test" {
		t.Errorf("unexpected subject %q", id.Subject)
	}
}

func TestDevReadsURLEncodedCookie(t *testing.T) {
	d, _ := NewDev("development", "")
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.AddCookie(&http.Cookie{Name: "dev_user", Value: "bob%40example.test"})
	id, err := d.Authenticate(r)
	if err != nil || id.Email != "bob@example.test" {
		t.Fatalf("id=%+v err=%v", id, err)
	}
}
