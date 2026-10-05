package auth

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
)

// Dev is a development-only authenticator. It trusts an X-Dev-User header (or dev_user cookie) and
// therefore must never run in production: the constructor and config validation both refuse it.
type Dev struct{ defaultEmail string }

func NewDev(appEnv, defaultEmail string) (Dev, error) {
	if appEnv == "production" {
		return Dev{}, errors.New("dev authentication is not available in production")
	}
	return Dev{defaultEmail: defaultEmail}, nil
}

func (d Dev) Authenticate(r *http.Request) (Identity, error) {
	email := strings.TrimSpace(r.Header.Get("X-Dev-User"))
	if email == "" {
		if c, err := r.Cookie("dev_user"); err == nil {
			// The browser stores it URL-encoded (@ -> %40).
			if v, err := url.QueryUnescape(c.Value); err == nil {
				email = strings.TrimSpace(v)
			}
		}
	}
	if email == "" {
		email = d.defaultEmail
	}
	if email == "" {
		return Identity{}, ErrUnauthenticated
	}
	email = strings.ToLower(email)
	return Identity{Subject: "dev:" + email, Email: email}, nil
}
