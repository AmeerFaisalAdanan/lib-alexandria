# Library of Alexandria (lib-ax): Handover

_Updated 2026-10-05. Multi-user MVP on branch `feat/multi-user-mvp` (not committed yet)._

A shared book **catalogue** (Google Sheets) with a **personal reading tracker** per user (PostgreSQL), behind Cloudflare Access. Mobile-first, EN/BM.

Since the first MVP, three features were added at the owner's request: **members can publish books** to the catalogue, the app tracks **who owns each physical copy and who has borrowed it** (and since when), and the new-book form can **scan a barcode or a cover** to autofill. The mobile bottom bar is now Library · Collections · **Home (centre)** · Lending · Add, with Settings in the header.

Read `docs/architecture.md` (design and decisions) and `docs/setup.md` (what needs your Google/Cloudflare accounts). The earlier handover described a single-user localStorage prototype with `owner: Alep | Taqim`; that model is gone.

## Administration (added after the MVP)
Roles (`member`/`admin`) and status (`active`/`disabled`) live on `users`; `requireAdmin` reads them from the database on every request. First administrator = `ADMIN_EMAILS` (only while no active admin exists). Settings → Administration (admins only) has Members, Catalogue (hide/show, data-quality flags) and System (safe service status + audit trail). Secrets are never stored in the database or shown in the UI. Last-admin protection, audit events and the disabled-account lockout are enforced and tested server-side. See `docs/architecture.md` → Administration. Deferred: editing/permanently removing catalogue records from the app, audit filtering and export, per-member activity.

## Layout
```
backend/                Go API (cmd/server, internal/{config,domain,catalogue,store,auth,api}, migrations, fixtures)
src/                    Next.js 16 / React 19 / Tailwind 4 / shadcn on Base UI
  lib/library.ts        pure domain logic (status rules, filters, stats): reused from the prototype
  lib/api.ts            API client (ApiError: network / 401 / 403 / …)
  store/library-store   Zustand cache over the API (optimistic updates, per-book ordered writes)
  components/data-gate  loading skeleton / error screens for every data page
e2e/                    Playwright (isolated package, runs in a container)
scripts/                go.sh, npm.sh, test-backend.sh, test-e2e.sh (no Go/Node needed on the host)
```

## Commands
`scripts/test-backend.sh` · `scripts/npm.sh run lint|typecheck|test|build` · `docker compose up -d --build` · `scripts/test-e2e.sh`

Local `.env` for the dev stack: `APP_ENV=development AUTH_MODE=dev CATALOGUE_SOURCE=fixture BOOK_LOOKUP=fixture COVER_SCAN=fixture ADMIN_EMAILS=admin@example.test` (the first four are refused when `APP_ENV=production`). The admin E2E tests sign in as `admin@example.test`; run E2E with `BOOK_LOOKUP=fixture` (the scan tests need the canned lookups).

## State of play (verified 2026-10-05)
- **Go tests pass**: domain, config guards, Cloudflare JWT (forged / expired / alg-confusion), Sheets read **and append** (header-aware, RAW values), cache, publishing (duplicates, validation, rate limit), copies and loans (permissions, one active loan, price privacy, DB constraints), ISBN lookup (checksum, provider merge, cache, failure handling), the cover reader against a fake Messages API (image block, schema, effort, refusal), endpoint limits, and cross-user isolation. Mutation-checked: removing the user filter from a query makes the isolation tests fail.
- **Vitest: 66 pass.** ESLint and `tsc` clean. Production Docker build; the 3-container stack is healthy and migrated a live database (62 reading records kept, 4 priced ones became copies).
- **Playwright: 38 pass** on the live stack: core flow, two-user isolation, states (loading/401/network/outage/rollback), publishing, lending, scanning (a **live fake webcam** filming a generated EAN-13 barcode, photos of a barcode, a cover, unknown barcodes, no camera), mobile nav (Home exactly centred at 360/390/412), responsive overflow and tap targets, long text, EN/BM, no console errors.
- **Verified against the real internet:** Open Library returned correct data for known ISBNs. Google Books answered **429** (keyless quota) and the chain carried on, hence the optional `GOOGLE_BOOKS_API_KEY`.
- **Not verified against the real services** (no credentials here): the live Google Sheet (adapter tested against a fake Sheets server, including append), a real Cloudflare Access token, and the **Claude cover reader** (tested against a fake Messages API; no `ANTHROPIC_API_KEY` was available). The Google Books parser has only seen fake data.

## Assumptions to confirm
- Purchase details (`price`, `purchaseDate`, `location`) belong to a **copy**, not to a reading record. Copies and owners are visible to every member; only the price is private to its owner. Anyone may borrow an available copy for themselves (trust-based, no approval step).
- `/library/add` is a catalogue browser; `/library/add/new` publishes a new book straight to the sheet (no approval step, 20 per member per day). Cover scanning sends the photo to Anthropic and is off without an API key.
- Refusal fallbacks (`fallbacks` parameter) are **not** enabled for the cover reader: a refusal is reported to the user as "could not read a book from that photo". Say if you want them on.
- Categories and language filter options come from the data, not a fixed list.

## Gotchas (carried over, still true)
1. shadcn `Slider` needs an array value (`value={[n]}`); use `sliderValue()` for callbacks.
2. Base UI, not Radix: compose with `render`, not `asChild`.
3. Dialogs opened from a dropdown menu must be siblings of the menu, not children.
4. `AlertDialogAction` does not close the dialog (ConfirmDialog does it).
5. ESLint 10 breaks `eslint-config-next`; stay on 9.
6. Use `useWatch` instead of `watch()` (React Compiler lint).
7. zxing: in the live scanner use the `controls` passed to the callback (a fast decode fires before `decodeFromConstraints` returns), and use the 1D reader (the multi-format reader logs a warning per frame).
8. Textarea is `field-sizing: fixed` on purpose: `content` lets one long unbroken string widen the whole page on mobile.
9. Next `rewrites` are resolved at build time: `API_ORIGIN` is a Docker build arg.
10. `next/font` needs network at build time.

## Next steps
1. Supply the real sheet + Cloudflare values (`docs/setup.md`) and run a real-service smoke test.
2. Load the real catalogue; decide the final `book_id` scheme.
3. Optional: rate-limit/log-shipping, a place to run `docker compose` on the LAN, backups for the `lib-ax-pgdata` volume.
4. Deferred (v1.1): catalogue admin, reading history, covers, ISBN lookup, a location filter.

## Working agreements
Conventional commits, no scope, no AI attribution; commit/push only on explicit go-ahead after showing the diff; mobile is the source of truth; don't redesign the UI; verify in a real browser.
