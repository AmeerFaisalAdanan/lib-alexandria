# Architecture

```
Browser ──► Cloudflare Access ──► web (Next.js 16, :3000) ──/api/*──► api (Go, :8081) ──► PostgreSQL
                                                                         └──────────────► Google Sheets (catalogue)
```

Only `web` is published. Cloudflare Access (or a Cloudflare Tunnel pointed at `web`) protects one origin; the browser
never talks to `api`, the database or Google, so there is no CORS and no secret in the browser.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Backend language | **Go** (chi, pgx, goose) | The work is HTTP + Postgres + one REST client + JWT validation + Docker. Go is the boring fit; Rust was not preferred by anything in the repo. |
| Database | **PostgreSQL 17** | Users, per-user state, collections; real foreign keys and constraints. |
| Catalogue | **Google Sheets** (the single source of truth) | Hand-editable shared catalogue. Read through a `CatalogueRepository`; cached in memory (default 5 min) and mirrored into a `books` table so user data has foreign keys. |
| Auth | **Cloudflare Access** JWT (`Cf-Access-Jwt-Assertion`) | Verified server-side against the team JWKS (RS256 only, issuer + audience + expiry). The user is derived from the token, never from the request body. |
| Dev auth | `AUTH_MODE=dev` (`X-Dev-User` header / `dev_user` cookie) | Local work without Cloudflare. Refused when `APP_ENV=production`, refused by the constructor too. UI shows a red banner. |
| API proxy | Next `rewrites` → `API_ORIGIN` (build-time arg) | One origin for Access, no CORS. |
| Client state | Zustand as a cache over the API; `localStorage` only for locale and list view | The server is the source of truth. |

## Domain model

> Changed since the first MVP: members can now **publish** new books to the catalogue, and the app tracks **physical copies and loans**. Both are described below.
- **Book** (shared, from the sheet): `id` (= `book_id`, stable and immutable), title, author, isbn, publisher, publication_year, language, category.
- **UserBook** (per user, PK `(user_id, book_id)`): status, progress, rating, notes, tags, and the user's own copy details (price, purchase date, location).
- **Collection** (per user) and `collection_books`. Composite foreign keys make the *database* refuse a collection and a book entry that belong to different users.
- **Copy** (a physical book): `owner` (who bought it), purchase date, price, location. Several members can own copies of the same book. Everyone sees owner, date and location; **the price is visible only to its owner**.
- **Loan** (a copy lent out): `borrower`, `borrowed_at`, optional `due_at`, `returned_at`. A partial unique index allows **one active loan per copy**, enforced by the database. Anyone may borrow an available copy for themselves; only the owner may lend it to someone else; the owner or the borrower may mark it returned; an owner cannot borrow their own copy, and a copy on loan cannot be removed.
- There is no `owner` field on `Book` or `UserBook`. Reading state (`UserBook`) and ownership (`Copy`) are separate: you can read a book you borrowed, and own a book you have not started.

Status rules (`backend/internal/domain`, mirrored in `src/lib/library.ts`): want → 0%, completed → 100%, progress > 0 starts a want-to-read book, progress never auto-completes, re-reading a completed book restarts at 0. The server result is authoritative; the client applies the same rules optimistically.

## API (all under `/api`, all authenticated; `/healthz` is public)

| Method | Path | Notes |
|---|---|---|
| GET | `/me` | `{id,email,name,authMode}` |
| GET | `/books`, `/books/{id}` | Catalogue, read-only |
| GET / POST | `/my/library` | POST `{bookId, …}` → 201, 409 if already added, 404 if not in the catalogue |
| GET / PATCH / DELETE | `/my/library/{bookId}` | PATCH: `null` clears an optional field; unknown fields are rejected |
| GET / POST | `/collections` | |
| PATCH / DELETE | `/collections/{id}` | |
| PUT / DELETE | `/collections/{id}/books/{bookId}` | Book must already be in the user's library |
| POST | `/books` | **Publish a new book** to the catalogue (appends a row to the sheet). 409 `duplicate` (with `existing`) if the ISBN or title+author is already there; 429 over the daily limit; 403 when turned off |
| GET | `/users` | Members (id, name, e-mail), to pick a borrower |
| GET / POST | `/copies` | All copies with their current loan. POST `{bookId, price?, purchaseDate?, location?}` records a copy you own |
| PATCH / DELETE | `/copies/{id}` | Owner only (403 otherwise); DELETE is refused (409) while on loan |
| POST / DELETE | `/copies/{id}/loan` | POST borrows (optionally `{borrowerId, dueAt}`; naming another borrower is owner-only); DELETE returns it |
| GET | `/lookup/isbn/{isbn}` | Suggested details for an ISBN: 400 invalid, 404 unknown, 503 providers down |
| POST | `/lookup/cover` | Raw image body (`Content-Type: image/jpeg|png|webp|gif`, ≤ 5 MB). 422 `unreadable` when no book is recognised |

Other users' resources are always `404` (never `403`), so existence does not leak. Errors are `{ "error": { "code", "message", "field?" } }`.

## Administration

**Two different things, kept apart.** *Application administration* (who is a member, who is an administrator, who is disabled, which catalogue records are hidden, the audit trail) lives in PostgreSQL and is managed in the app. *Infrastructure secrets* (Google service account, `GOOGLE_BOOKS_API_KEY`, `ANTHROPIC_API_KEY`, `CF_ACCESS_*`, database passwords) stay in environment variables or Docker secrets and are **never** stored in the database or shown in the UI. The System page only reports `healthy`, `unavailable`, `configured`, `not_configured`.

- **Roles and status**: `users.role` (`member`/`admin`) and `users.status` (`active`/`disabled`), enforced by CHECK constraints. The migration defaults everyone to `member`/`active`; nobody becomes an administrator by migration.
- **Authorization is server-side and read from the database on every request.** The authenticated identity (Cloudflare JWT) resolves to a member; `requireAdmin` accepts only `role = admin AND status = active`. Nothing in a body, query string, cookie or client state can grant or claim a role. A disabled member is refused with `403 account_disabled` on every route, and logging in again does not re-enable anyone.
- **Bootstrap** (`ADMIN_EMAILS`): an allow-listed e-mail, taken from the verified identity, becomes an administrator **only while the database has no active administrator**. It is an initial-setup and break-glass mechanism, not a standing override: once an admin exists, a demotion sticks and the list promotes nobody. Each bootstrap is audited (`admin.bootstrapped`).
- **Last-admin protection**: the final active administrator can be neither demoted nor disabled (`409 last_admin`). The check runs in the same transaction as the change, with the active administrators locked, so two admins cannot remove each other at once.
- **No deletion**: members are disabled, not deleted.
- **Audit trail** (`audit_events`): written in the same transaction as the change it records, with the actor taken from the authenticated identity. Metadata holds identifiers, e-mails and before/after values only, never secrets.
- **Catalogue moderation** is soft and reversible: an administrator can hide a record (`catalogue_hidden`). Members no longer see it and cannot newly add it to a library or record a copy; existing library entries and copies are untouched; the sheet is **never** modified. Admins also see data-quality flags (`missing_isbn`, `possible_duplicate`), who published each record, and reader and copy counts. Permanent removal and editing stay in the Google Sheet for now.

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/members` | All members with role and status |
| PATCH | `/admin/members/{id}` | `{role?, status?}`; unknown fields rejected (the body can name neither the actor nor an identity) |
| GET | `/admin/system` | Service status and non-secret environment; probes are cheap and read-only (Postgres ping, catalogue cache, sheet metadata, Cloudflare key set). Google Books and the cover scanner are reported as configured but never probed (quota and cost) |
| GET | `/admin/audit?limit=` | Newest first, up to 200 |
| GET | `/admin/catalogue` | Every record with issues, hidden flag, counts |
| PATCH | `/admin/catalogue/{bookId}` | `{hidden: bool}` |

## Publishing a book

Any signed-in member can add a book (`POST /api/books`). The backend validates and tidies the input, rejects duplicates (same ISBN, or same title and author ignoring case and spacing), generates a permanent id (`bk-` + 12 random characters; never reused), appends a row **at the bottom of the sheet under the right headers**, and updates its cache so everyone sees it immediately. Rows are written as plain values, so a title such as `=HYPERLINK(...)` can never run as a formula. Each member may publish 20 books per rolling day (`SUBMISSION_LIMIT_PER_DAY`); the author is recorded in `catalogue_submissions` (and in an optional `added_by` column in the sheet). Turn it off with `CATALOGUE_SUBMISSIONS=false`. This needs the Google service account to be an **Editor** of the sheet.

## Scan to autofill (new-book form)

- **Barcode.** The browser reads the EAN-13 barcode (ZXing, so it works on iOS and Firefox where the native `BarcodeDetector` does not) from a live camera or from a photo, and the backend suggests details for the ISBN from Open Library, then Google Books, merged and cached for 24 hours. A live camera needs a secure page (HTTPS or localhost); on a plain-HTTP LAN address the scanner says so and offers a photo instead.
- **Cover.** A photo is first searched for a barcode (cheap and exact). If there is none, it is downsized to 1568 px in the browser and read by a Claude vision model through the official Go SDK (structured output, low effort, default model `claude-opus-5-5`, override with `COVER_SCAN_MODEL`). If the cover shows a readable ISBN, the ISBN databases take precedence (a one-digit misread is always caught by the check digit). **The photo is sent to Anthropic**; it is not stored. Off unless `ANTHROPIC_API_KEY` is set. Limit 30 scans per member per day.
- Results only **suggest**: they fill empty fields of the form for the user to check. A category the user already chose is never replaced. All text is cleaned (control characters removed, lengths capped, implausible years and invalid ISBNs dropped) because it comes from the web or from a photographed cover.

## Catalogue sheet contract

Header row (case-insensitive, any order, extra columns ignored): `book_id`, `title`, `author`, `language`, `category`; optional `isbn`, `publisher`, `publication_year`.
- `book_id` is **required, unique and must never change or be reused** (e.g. `bk-0001`). Row numbers are never used as identity.
- Rows missing `book_id`/`title`/`author`, and duplicate ids, are skipped and logged, not fatal.
- `language`: `English` and `Bahasa Melayu` are translated in the UI (aliases `en`, `bm`, `ms`, `malay`… are normalised); anything else is shown as written.
- If a refresh fails the last good copy keeps being served.
- Removing a row does not remove it from users' libraries (their entries keep the mirrored copy).
- An optional `added_by` column is filled with the publisher's e-mail when a member adds a book from the app.

## Security notes

- Server-side ownership checks on every user-scoped query (every SQL statement filters on `user_id`); isolation is covered by tests and by DB constraints.
- Parameterised SQL only. JSON bodies are strict (unknown fields rejected, 1 MiB cap). No CORS headers.
- Request logs contain method, path, status and duration only; never headers, cookies or tokens.
- Google credentials are mounted read-only into the `api` container only.
