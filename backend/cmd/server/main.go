package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"golang.org/x/oauth2/google"

	"libax/internal/api"
	"libax/internal/auth"
	"libax/internal/catalogue"
	"libax/internal/config"
	"libax/internal/health"
	"libax/internal/lookup"
	"libax/internal/store"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(log); err != nil {
		log.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if cfg.MigrateOnStart {
		if err := store.Migrate(ctx, cfg.DatabaseURL); err != nil {
			return err
		}
	}
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	db.BootstrapAdmins = cfg.AdminEmails

	var src catalogue.Source
	var sheetsPing func(context.Context) error
	switch cfg.CatalogueSource {
	case config.CatalogueFixture:
		log.Warn("using the fixture catalogue (development only)")
		src = &catalogue.FixtureSource{Path: cfg.FixturePath}
	default:
		scope := "https://www.googleapis.com/auth/spreadsheets.readonly"
		if cfg.CatalogueSubmissions {
			scope = "https://www.googleapis.com/auth/spreadsheets" // appending a row needs write access
		}
		jwtCfg, err := google.JWTConfigFromJSON(cfg.GoogleCredentials, scope)
		if err != nil {
			return err
		}
		sheets := catalogue.SheetsSource{
			Client:        jwtCfg.Client(ctx),
			SpreadsheetID: cfg.SheetsSpreadsheetID,
			Range:         cfg.SheetsRange,
			Log:           log,
		}
		src, sheetsPing = sheets, sheets.Ping
	}
	cat := catalogue.NewCache(src, cfg.CatalogueTTL, log, db.UpsertBooks)
	var isbnLookup lookup.ISBNLookup
	switch cfg.BookLookup {
	case "fixture":
		isbnLookup = lookup.Fixture{}
	case "online":
		hc := &http.Client{Timeout: 10 * time.Second}
		isbnLookup = &lookup.Chain{Log: log, Providers: []lookup.ISBNLookup{lookup.OpenLibrary{Client: hc}, lookup.GoogleBooks{Client: hc, APIKey: cfg.GoogleBooksAPIKey}}}
	}
	var coverReader lookup.CoverReader
	switch {
	case !cfg.CoverScanEnabled():
	case cfg.CoverScan == "fixture":
		coverReader = lookup.Fixture{}
	default:
		coverReader = lookup.NewAnthropic(cfg.AnthropicAPIKey, cfg.CoverScanModel, "")
		log.Info("cover scanning enabled: photos are sent to Anthropic", "model", cfg.CoverScanModel)
	}

	var publisher catalogue.Publisher
	if cfg.CatalogueSubmissions {
		publisher = cat
	}

	var authenticator auth.Authenticator
	var cloudflareProbe func(context.Context) error
	switch cfg.AuthMode {
	case config.AuthDev:
		dev, err := auth.NewDev(cfg.Env, cfg.DevUserEmail)
		if err != nil {
			return err
		}
		log.Warn("DEVELOPMENT AUTHENTICATION ENABLED: requests are trusted via X-Dev-User")
		authenticator = dev
	default:
		cf := auth.NewCloudflare(cfg.CFIssuer(), cfg.CFAudience, nil)
		authenticator, cloudflareProbe = cf, cf.Probe
	}

	// What the admin status page reports. Each entry says whether something is configured and, where a probe is
	// cheap and read-only, whether it answers. Nothing here carries a secret.
	services := []health.Service{
		{Key: "postgres", Configured: true, Probe: db.Ping},
		{Key: "catalogue", Configured: true, Detail: cfg.CatalogueSource, Probe: func(ctx context.Context) error { _, err := cat.ListBooks(ctx); return err }},
		{Key: "googleSheets", Configured: cfg.CatalogueSource == config.CatalogueSheets, Detail: sourceDetail(cfg.CatalogueSource), Probe: sheetsPing},
		{Key: "openLibrary", Configured: cfg.BookLookup == "online" || cfg.BookLookup == "", Detail: lookupDetail(cfg.BookLookup)},
		{Key: "googleBooks", Configured: cfg.GoogleBooksAPIKey != "" && cfg.BookLookup != "off", Detail: lookupDetail(cfg.BookLookup)},
		{Key: "coverScanner", Configured: cfg.CoverScanEnabled(), Detail: coverDetail(cfg.CoverScan)},
		{Key: "cloudflareAccess", Configured: cfg.AuthMode == config.AuthCloudflare && cfg.CFTeamDomain != "" && cfg.CFAudience != "", Detail: authDetail(cfg.AuthMode), Probe: cloudflareProbe},
	}

	srv := &http.Server{
		Addr: cfg.Addr,
		Handler: api.NewRouter(api.Deps{
			Store: db, Catalogue: cat, Log: log,
			Auth: auth.Middleware(authenticator, api.Provisioner(db), log), AuthMode: cfg.AuthMode,
			Publisher: publisher, SubmissionLimit: cfg.SubmissionLimitPerDay,
			ISBN: isbnLookup, Cover: coverReader, LookupLimit: cfg.LookupLimitPerDay, CoverScanLimit: cfg.CoverLimitPerDay,
			Health: services,
			Info:   api.SystemInfo{Env: cfg.Env, AuthMode: cfg.AuthMode, CatalogueSource: cfg.CatalogueSource, BookLookup: cfg.BookLookup, Submissions: cfg.CatalogueSubmissions},
		}),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.Addr, "env", cfg.Env, "auth", cfg.AuthMode, "catalogue", cfg.CatalogueSource)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdown)
	}
	return nil
}

// The *Detail helpers describe a mode with a fixed word. They never include a value read from a secret.
func sourceDetail(source string) string {
	if source == config.CatalogueFixture {
		return "fixture"
	}
	return ""
}

func lookupDetail(mode string) string {
	if mode == "fixture" {
		return "fixture"
	}
	return ""
}

func coverDetail(mode string) string {
	if mode == "fixture" {
		return "fixture"
	}
	return ""
}

func authDetail(mode string) string {
	if mode == config.AuthDev {
		return "development"
	}
	return ""
}
