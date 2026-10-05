// Package config loads and validates process configuration from the environment.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	EnvProduction  = "production"
	EnvDevelopment = "development"
	EnvTest        = "test"

	AuthCloudflare = "cloudflare"
	AuthDev        = "dev"

	CatalogueSheets  = "sheets"
	CatalogueFixture = "fixture"
)

type Config struct {
	Env            string
	Addr           string
	DatabaseURL    string
	MigrateOnStart bool

	AuthMode     string
	CFTeamDomain string // e.g. myteam.cloudflareaccess.com
	CFAudience   string // Access application AUD tag
	DevUserEmail string // default identity when AuthMode=dev

	CatalogueSource     string
	FixturePath         string
	SheetsSpreadsheetID string
	SheetsRange         string
	GoogleCredentials   []byte // service-account JSON
	CatalogueTTL        time.Duration

	// CatalogueSubmissions lets signed-in users publish new books to the shared catalogue.
	// With Sheets this needs the service account to have Editor (not Viewer) access.
	CatalogueSubmissions  bool
	SubmissionLimitPerDay int

	// BookLookup fills the new-book form from an ISBN: "online" (Open Library + Google Books), "fixture"
	// (canned, development only) or "off".
	BookLookup        string
	LookupLimitPerDay int
	// CoverScan reads a photo of a cover with a Claude vision model: "auto" (on when ANTHROPIC_API_KEY is
	// set), "fixture" (canned, development only) or "off". The photo is sent to Anthropic.
	CoverScan        string
	AnthropicAPIKey  string
	CoverScanModel   string
	CoverLimitPerDay int

	// AdminEmails may become the first administrator while the database has none (see store.UpsertUser).
	AdminEmails []string

	// GoogleBooksAPIKey is optional; without it the Google Books quota is shared and often exhausted.
	GoogleBooksAPIKey string
}

// Load reads configuration from the environment and refuses unsafe combinations.
func Load() (Config, error) {
	c := Config{
		Env:            getenv("APP_ENV", EnvProduction),
		Addr:           getenv("ADDR", ":8081"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		MigrateOnStart: getenv("MIGRATE_ON_START", "true") == "true",

		AuthMode:     getenv("AUTH_MODE", AuthCloudflare),
		CFTeamDomain: os.Getenv("CF_ACCESS_TEAM_DOMAIN"),
		CFAudience:   os.Getenv("CF_ACCESS_AUD"),
		DevUserEmail: getenv("DEV_USER_EMAIL", "dev@example.test"),

		CatalogueSource:     getenv("CATALOGUE_SOURCE", CatalogueSheets),
		FixturePath:         getenv("CATALOGUE_FIXTURE_PATH", "fixtures/catalogue.json"),
		SheetsSpreadsheetID: os.Getenv("SHEETS_SPREADSHEET_ID"),
		SheetsRange:         getenv("SHEETS_RANGE", "Catalogue!A:H"),
	}

	c.CatalogueSubmissions = getenv("CATALOGUE_SUBMISSIONS", "true") == "true"
	limit, err := strconv.Atoi(getenv("SUBMISSION_LIMIT_PER_DAY", "20"))
	if err != nil || limit < 1 {
		return c, errors.New("SUBMISSION_LIMIT_PER_DAY must be a positive integer")
	}
	c.SubmissionLimitPerDay = limit

	c.BookLookup = getenv("BOOK_LOOKUP", "online")
	c.CoverScan = getenv("COVER_SCAN", "auto")
	c.AnthropicAPIKey = os.Getenv("ANTHROPIC_API_KEY")
	for _, e := range strings.Split(os.Getenv("ADMIN_EMAILS"), ",") {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			c.AdminEmails = append(c.AdminEmails, e)
		}
	}
	c.GoogleBooksAPIKey = os.Getenv("GOOGLE_BOOKS_API_KEY")
	c.CoverScanModel = getenv("COVER_SCAN_MODEL", "claude-opus-5-5")
	for key, dst := range map[string]*int{"LOOKUP_LIMIT_PER_DAY": &c.LookupLimitPerDay, "COVER_LIMIT_PER_DAY": &c.CoverLimitPerDay} {
		def := "300"
		if key == "COVER_LIMIT_PER_DAY" {
			def = "30"
		}
		n, err := strconv.Atoi(getenv(key, def))
		if err != nil || n < 1 {
			return c, fmt.Errorf("%s must be a positive integer", key)
		}
		*dst = n
	}

	ttl, err := time.ParseDuration(getenv("CATALOGUE_TTL", "5m"))
	if err != nil {
		return c, fmt.Errorf("CATALOGUE_TTL: %w", err)
	}
	c.CatalogueTTL = ttl

	if raw := os.Getenv("GOOGLE_CREDENTIALS_JSON"); raw != "" {
		c.GoogleCredentials = []byte(raw)
	} else if path := os.Getenv("GOOGLE_CREDENTIALS_FILE"); path != "" {
		b, err := os.ReadFile(path)
		if err != nil {
			return c, fmt.Errorf("GOOGLE_CREDENTIALS_FILE: %w", err)
		}
		c.GoogleCredentials = b
	}

	return c, c.Validate()
}

// Validate enforces the guard rails that keep development shortcuts out of production.
func (c Config) Validate() error {
	var errs []error
	add := func(format string, a ...any) { errs = append(errs, fmt.Errorf(format, a...)) }

	switch c.Env {
	case EnvProduction, EnvDevelopment, EnvTest:
	default:
		add("APP_ENV must be production, development or test (got %q)", c.Env)
	}
	if c.DatabaseURL == "" {
		add("DATABASE_URL is required")
	}

	switch c.AuthMode {
	case AuthCloudflare:
		if c.CFTeamDomain == "" || c.CFAudience == "" {
			add("AUTH_MODE=cloudflare requires CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD")
		}
	case AuthDev:
		if c.Env == EnvProduction {
			add("AUTH_MODE=dev is not allowed when APP_ENV=production")
		}
	default:
		add("AUTH_MODE must be cloudflare or dev (got %q)", c.AuthMode)
	}

	switch c.CatalogueSource {
	case CatalogueSheets:
		if c.SheetsSpreadsheetID == "" || len(c.GoogleCredentials) == 0 {
			add("CATALOGUE_SOURCE=sheets requires SHEETS_SPREADSHEET_ID and GOOGLE_CREDENTIALS_JSON or GOOGLE_CREDENTIALS_FILE")
		}
	case CatalogueFixture:
		if c.Env == EnvProduction {
			add("CATALOGUE_SOURCE=fixture is not allowed when APP_ENV=production")
		}
	default:
		add("CATALOGUE_SOURCE must be sheets or fixture (got %q)", c.CatalogueSource)
	}

	for _, e := range c.AdminEmails {
		if !strings.Contains(e, "@") {
			add("ADMIN_EMAILS contains %q, which is not an e-mail address", e)
		}
	}

	switch c.BookLookup {
	case "online", "off", "": // "" = default (online)
	case "fixture":
		if c.Env == EnvProduction {
			add("BOOK_LOOKUP=fixture is not allowed when APP_ENV=production")
		}
	default:
		add("BOOK_LOOKUP must be online, fixture or off (got %q)", c.BookLookup)
	}
	switch c.CoverScan {
	case "auto", "off", "": // "" = default (auto)
	case "fixture":
		if c.Env == EnvProduction {
			add("COVER_SCAN=fixture is not allowed when APP_ENV=production")
		}
	default:
		add("COVER_SCAN must be auto, fixture or off (got %q)", c.CoverScan)
	}

	return errors.Join(errs...)
}

// CoverScanEnabled reports whether photo scanning of covers will be offered.
func (c Config) CoverScanEnabled() bool {
	switch c.CoverScan {
	case "fixture":
		return true
	case "auto", "":
		return c.AnthropicAPIKey != ""
	}
	return false
}

// CFIssuer is the expected "iss" claim for Cloudflare Access tokens.
func (c Config) CFIssuer() string { return "https://" + c.cfHost() }

func (c Config) cfHost() string {
	host := strings.TrimPrefix(strings.TrimPrefix(c.CFTeamDomain, "https://"), "http://")
	host = strings.TrimSuffix(host, "/")
	if !strings.Contains(host, ".") {
		host += ".cloudflareaccess.com"
	}
	return host
}

func getenv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
