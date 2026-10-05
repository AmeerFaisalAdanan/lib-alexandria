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

	var src catalogue.Source
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
		src = catalogue.SheetsSource{
			Client:        jwtCfg.Client(ctx),
			SpreadsheetID: cfg.SheetsSpreadsheetID,
			Range:         cfg.SheetsRange,
			Log:           log,
		}
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
	switch cfg.AuthMode {
	case config.AuthDev:
		dev, err := auth.NewDev(cfg.Env, cfg.DevUserEmail)
		if err != nil {
			return err
		}
		log.Warn("DEVELOPMENT AUTHENTICATION ENABLED: requests are trusted via X-Dev-User")
		authenticator = dev
	default:
		authenticator = auth.NewCloudflare(cfg.CFIssuer(), cfg.CFAudience, nil)
	}

	provision := func(ctx context.Context, id auth.Identity) (auth.User, error) {
		u, err := db.UpsertUser(ctx, id.Subject, id.Email, id.Name)
		return auth.User{ID: u.ID, Email: u.Email, Name: u.Name}, err
	}

	srv := &http.Server{
		Addr: cfg.Addr,
		Handler: api.NewRouter(api.Deps{
			Store: db, Catalogue: cat, Log: log,
			Auth: auth.Middleware(authenticator, provision, log), AuthMode: cfg.AuthMode,
			Publisher: publisher, SubmissionLimit: cfg.SubmissionLimitPerDay,
			ISBN: isbnLookup, Cover: coverReader, LookupLimit: cfg.LookupLimitPerDay, CoverScanLimit: cfg.CoverLimitPerDay,
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
