package config

import (
	"strings"
	"testing"
)

func valid() Config {
	return Config{
		Env: EnvDevelopment, DatabaseURL: "postgres://x", AuthMode: AuthDev,
		CatalogueSource: CatalogueFixture,
	}
}

func TestDevAuthRefusedInProduction(t *testing.T) {
	c := valid()
	c.Env = EnvProduction
	c.CatalogueSource = CatalogueFixture
	err := c.Validate()
	if err == nil || !strings.Contains(err.Error(), "AUTH_MODE=dev is not allowed") {
		t.Fatalf("dev auth must be refused in production, got %v", err)
	}
	if !strings.Contains(err.Error(), "CATALOGUE_SOURCE=fixture is not allowed") {
		t.Fatalf("fixture catalogue must be refused in production, got %v", err)
	}
}

func TestDevAuthAllowedInDevelopment(t *testing.T) {
	if err := valid().Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestProductionRequiresCloudflareAndSheets(t *testing.T) {
	c := Config{Env: EnvProduction, DatabaseURL: "postgres://x", AuthMode: AuthCloudflare, CatalogueSource: CatalogueSheets}
	err := c.Validate()
	if err == nil || !strings.Contains(err.Error(), "CF_ACCESS_TEAM_DOMAIN") || !strings.Contains(err.Error(), "SHEETS_SPREADSHEET_ID") {
		t.Fatalf("missing settings must be reported, got %v", err)
	}
	c.CFTeamDomain, c.CFAudience = "myteam", "aud"
	c.SheetsSpreadsheetID, c.GoogleCredentials = "sheet", []byte("{}")
	if err := c.Validate(); err != nil {
		t.Fatal(err)
	}
	if got := c.CFIssuer(); got != "https://myteam.cloudflareaccess.com" {
		t.Errorf("issuer = %q", got)
	}
}

func TestDefaultsAreSafe(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("APP_ENV", "")
	t.Setenv("AUTH_MODE", "")
	t.Setenv("CATALOGUE_SOURCE", "")
	_, err := Load()
	if err == nil {
		t.Fatal("with nothing configured the default (production, cloudflare, sheets) must fail validation")
	}
}

func TestScanFixturesRefusedInProductionAndCoverScanNeedsAKey(t *testing.T) {
	base := Config{Env: EnvProduction, DatabaseURL: "postgres://x", AuthMode: AuthCloudflare, CFTeamDomain: "t", CFAudience: "a",
		CatalogueSource: CatalogueSheets, SheetsSpreadsheetID: "s", GoogleCredentials: []byte("{}"), BookLookup: "online", CoverScan: "auto"}
	if err := base.Validate(); err != nil {
		t.Fatal(err)
	}
	c := base
	c.BookLookup, c.CoverScan = "fixture", "fixture"
	err := c.Validate()
	if err == nil || !strings.Contains(err.Error(), "BOOK_LOOKUP=fixture") || !strings.Contains(err.Error(), "COVER_SCAN=fixture") {
		t.Fatalf("fixtures must be refused in production: %v", err)
	}
	c = base
	c.BookLookup = "everything"
	if c.Validate() == nil {
		t.Error("unknown lookup mode must be rejected")
	}

	if base.CoverScanEnabled() {
		t.Error("auto without a key must be off")
	}
	base.AnthropicAPIKey = "sk-test"
	if !base.CoverScanEnabled() {
		t.Error("auto with a key must be on")
	}
	base.CoverScan = "off"
	if base.CoverScanEnabled() {
		t.Error("off must be off even with a key")
	}
}
