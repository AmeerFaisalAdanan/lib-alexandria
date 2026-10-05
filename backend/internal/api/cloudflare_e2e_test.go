package api_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"libax/internal/api"
	"libax/internal/auth"
	"libax/internal/store"
)

// A signed Cloudflare Access token travels through the real middleware: the server derives the user from
// the verified token, provisions them on first sight, and ignores anything else the caller sends.
func TestCloudflareTokenMapsToProvisionedUser(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	jwks := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kid": "k1", "kty": "RSA",
			"n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		}}})
	}))
	defer jwks.Close()

	db, err := store.Open(context.Background(), testDBURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	log := slog.New(slog.DiscardHandler)
	cf := auth.NewCloudflare(jwks.URL, "my-aud", jwks.Client())
	provision := api.Provisioner(db)
	srv := httptest.NewServer(api.NewRouter(api.Deps{Store: db, Catalogue: books, Log: log, Auth: auth.Middleware(cf, provision, log)}))
	defer srv.Close()

	sub := newUser(t, "sub")
	sign := func(sub, email string) string {
		tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
			"iss": jwks.URL, "aud": []string{"my-aud"}, "sub": sub, "email": email, "exp": time.Now().Add(time.Hour).Unix(),
		})
		tok.Header["kid"] = "k1"
		s, _ := tok.SignedString(key)
		return s
	}
	me := func(token, devHeader string) (int, map[string]any) {
		req, _ := http.NewRequest("GET", srv.URL+"/api/me", nil)
		if token != "" {
			req.Header.Set("Cf-Access-Jwt-Assertion", token)
		}
		if devHeader != "" {
			req.Header.Set("X-Dev-User", devHeader)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var body map[string]any
		_ = json.NewDecoder(res.Body).Decode(&body)
		return res.StatusCode, body
	}

	status, first := me(sign(sub, "grace@example.com"), "")
	if status != 200 || first["email"] != "grace@example.com" {
		t.Fatalf("valid token: %d %v", status, first)
	}
	_, again := me(sign(sub, "grace@example.com"), "")
	if again["id"] != first["id"] {
		t.Fatal("same token subject must map to the same local user")
	}
	if status, _ := me("", "grace@example.com"); status != 401 {
		t.Fatalf("X-Dev-User must mean nothing when Cloudflare auth is configured, got %d", status)
	}
	if status, _ := me(sign(sub, "grace@example.com")+"x", ""); status != 401 {
		t.Fatalf("tampered token must be rejected, got %d", status)
	}
}
