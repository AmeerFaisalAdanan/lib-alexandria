# Setup: the parts only you can do

Everything else is built and tested. These need your Google and Cloudflare accounts.

## 1. Catalogue sheet (Google Sheets)
1. Create a sheet with a tab named `Catalogue` (or set `SHEETS_RANGE`). Header row: `book_id, title, author, isbn, publisher, publication_year, language, category`. Give every book a unique, permanent `book_id` (e.g. `bk-0001`).
2. Google Cloud console: create a project → enable **Google Sheets API** → create a **service account** → create a **JSON key**.
3. Share the sheet with the service account's e-mail address as **Editor** (members can publish books from the app, which appends rows). A Viewer is enough only if you set `CATALOGUE_SUBMISSIONS=false`.
4. Save the key as `.secrets/google-service-account.json` (git-ignored).
5. In `.env`: `CATALOGUE_SOURCE=sheets`, `SHEETS_SPREADSHEET_ID=<id from the sheet URL>`, `GOOGLE_CREDENTIALS_HOST_PATH=./.secrets/google-service-account.json`, `GOOGLE_CREDENTIALS_FILE=/run/secrets/google.json`.

Optional column: `added_by` (the app fills in who published the book).

## 1b. Scanning (optional)
- **Barcode → details** works out of the box (Open Library needs no key). Google Books is a second source; its keyless quota is shared and often returns HTTP 429, so for reliability create an API key (Google Cloud → Books API) and set `GOOGLE_BOOKS_API_KEY`.
- **Cover photo → details** needs an Anthropic API key: set `ANTHROPIC_API_KEY` (the photo is sent to Anthropic to be read; set `COVER_SCAN=off` to forbid it). `COVER_SCAN_MODEL` defaults to `claude-opus-5-5`; a cheaper model also reads covers.
- The live camera needs HTTPS (the Cloudflare hostname is fine) or `localhost`.

## 1c. Administrators
Set `ADMIN_EMAILS` to the e-mail(s) of the first administrator(s) (comma-separated). The first of them to sign in while the database has no active administrator becomes one; after that, manage roles in the app under **Settings → Administration → Members**. The list is also your way back in if every administrator is ever disabled. It never overrides a demotion while an administrator exists.

## 2. Cloudflare Access
1. Zero Trust → Access → Applications → add a **Self-hosted** application for the hostname that serves this app (via Cloudflare Tunnel → `http://<host>:8080`). Add your allow policy (who may sign in).
2. Copy the application's **Audience (AUD) tag** and your team domain (`<team>.cloudflareaccess.com`).
3. In `.env`: `CF_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com`, `CF_ACCESS_AUD=<aud tag>`, `APP_ENV=production`, `AUTH_MODE=cloudflare`.
4. Only `web` (port 8080) should be reachable from the tunnel. Never publish the `api` container.
5. Sign-out uses Cloudflare's `/cdn-cgi/access/logout` on the same hostname.

## 3. Run
```bash
cp .env.example .env   # fill in, set a real POSTGRES_PASSWORD
docker compose up -d --build
```
Local / LAN development without Cloudflare or a sheet: use the commented "development" block in `.env.example` (dev auth + fixture catalogue). The server refuses those settings when `APP_ENV=production`.

## 4. Verify (needs Docker only; Go and Node run in containers)
```bash
scripts/test-backend.sh                     # Go tests against a throwaway Postgres
scripts/npm.sh run typecheck && scripts/npm.sh run lint && scripts/npm.sh test
docker compose up -d --build && scripts/test-e2e.sh   # Playwright (dev auth + fixtures)
```
