package auth

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	cfHeader = "Cf-Access-Jwt-Assertion"
	cfCookie = "CF_Authorization"
)

// Cloudflare validates Cloudflare Access application tokens: RS256 signature against the team's JWKS,
// plus issuer, audience and expiry.
type Cloudflare struct {
	issuer   string
	audience string
	jwksURL  string
	client   *http.Client

	mu          sync.Mutex
	keys        map[string]*rsa.PublicKey
	lastRefresh time.Time
}

// NewCloudflare takes the token issuer (https://<team>.cloudflareaccess.com) and the Access application AUD tag.
func NewCloudflare(issuer, audience string, client *http.Client) *Cloudflare {
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &Cloudflare{issuer: issuer, audience: audience, jwksURL: issuer + "/cdn-cgi/access/certs", client: client}
}

func (c *Cloudflare) Authenticate(r *http.Request) (Identity, error) {
	raw := r.Header.Get(cfHeader)
	if raw == "" {
		if ck, err := r.Cookie(cfCookie); err == nil {
			raw = ck.Value
		}
	}
	if raw == "" {
		return Identity{}, ErrUnauthenticated
	}

	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(raw, claims, c.keyFunc,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(c.issuer),
		jwt.WithAudience(c.audience),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return Identity{}, fmt.Errorf("%w: invalid access token", ErrUnauthenticated)
	}

	sub, _ := claims["sub"].(string)
	email, _ := claims["email"].(string)
	if email == "" {
		email, _ = claims["common_name"].(string) // service tokens carry no email
	}
	if sub == "" || email == "" {
		return Identity{}, fmt.Errorf("%w: token has no usable identity", ErrUnauthenticated)
	}
	name, _ := claims["name"].(string)
	return Identity{Subject: "cf:" + sub, Email: email, Name: name}, nil
}

func (c *Cloudflare) keyFunc(t *jwt.Token) (any, error) {
	kid, _ := t.Header["kid"].(string)
	if kid == "" {
		return nil, errors.New("token has no kid")
	}
	if k := c.lookup(kid); k != nil {
		return k, nil
	}
	if err := c.refresh(); err != nil {
		return nil, err
	}
	if k := c.lookup(kid); k != nil {
		return k, nil
	}
	return nil, errors.New("unknown signing key")
}

func (c *Cloudflare) lookup(kid string) *rsa.PublicKey {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.keys[kid]
}

// refresh re-downloads the JWKS, at most once a minute so unknown kids cannot be used to hammer Cloudflare.
func (c *Cloudflare) refresh() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.keys != nil && time.Since(c.lastRefresh) < time.Minute {
		return nil
	}
	resp, err := c.client.Get(c.jwksURL)
	if err != nil {
		return fmt.Errorf("fetch jwks: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("fetch jwks: status %d", resp.StatusCode)
	}
	var doc struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&doc); err != nil {
		return fmt.Errorf("parse jwks: %w", err)
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range doc.Keys {
		if k.Kty != "RSA" {
			continue
		}
		n, err1 := base64.RawURLEncoding.DecodeString(k.N)
		e, err2 := base64.RawURLEncoding.DecodeString(k.E)
		if err1 != nil || err2 != nil {
			continue
		}
		keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
	}
	c.keys, c.lastRefresh = keys, time.Now()
	return nil
}
