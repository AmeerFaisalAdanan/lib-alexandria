# Library of Alexandria (lib-ax) — Agent Handover

_Last updated: 2026-10-05 · Branch: `feat/functional-prototype` · Phase 2 (functional frontend prototype)_

Read this before touching the code. It covers what the app is, how it's put together, what's verified, the gotchas behind the current design, and what's left.

---

## 1. What this is

A personal library app for a shared book collection owned by **Alep** and **Taqim**. It has three phases:

| Phase | Scope | Status |
|---|---|---|
| 1 | Static visual mockup | ✅ Done. Kept for reference at `design/mockup.html` (not served). |
| 2 | **Functional frontend prototype**: mock data, local state, EN/BM, full CRUD, **no backend** | ✅ Done on this branch |
| 3 | Backend: auth, database, API, ISBN lookup, uploads, image storage | ⛔ Not started. Deliberately out of scope for phase 2. |

**Phase 2 definition of done** (from the product brief): a user can *browse → search → filter → open → add → edit → update progress → complete → delete → change language → refresh*, and the app behaves consistently with no backend.

**Hard constraints for phase 2.** Do not add any of these:
- auth
- a database or API routes
- server actions for persistence
- external book/ISBN APIs
- file uploads
- real image storage

Everything runs in the browser on mock data persisted to `localStorage`.

---

## 2. Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
npm run lint         # ESLint 9 flat config, must be clean
npm run typecheck    # tsc --noEmit, must be clean

docker compose up -d --build   # http://localhost:8080 (container lib-ax-app, port 8080 → 3000)
```

- Node ≥ 20.9 is required (the Docker image uses `node:22-alpine`).
- The Docker image is a Next.js **standalone** build that runs as a non-root `nextjs` user (~230 MB).
- `next/font` downloads Plus Jakarta Sans from Google at build time, so builds need network access.

---

## 3. Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.3** (App Router, Turbopack) + **React 19.3** | All pages are client components (data lives in `localStorage`). |
| Styling | **Tailwind CSS v4.3** | Theme tokens live in `src/app/globals.css` (`@theme inline`). There's no `tailwind.config.js` in v4. |
| UI kit | **shadcn/ui, `base-nova` preset** | ⚠️ Built on **Base UI** (`@base-ui/react`), **not Radix**. Generated components live in `src/components/ui/`. |
| Class merge | `cn` package (shadcn's clsx + tailwind-merge replacement) | Imported via `@/lib/utils`. |
| State | **Zustand 5** + `persist` | Two stores, both rehydrated manually (see §5.2). |
| Forms | **React Hook Form 7** + **Zod 4** via `@hookform/resolvers` | One shared form for Add and Edit. |
| Toasts | `sonner` | Pinned to dark theme; `next-themes` deliberately removed. |
| Icons | `lucide-react` | |
| Lint | ESLint **9** + `eslint-config-next` 16 | ⚠️ Don't upgrade to ESLint 10 yet (see §8). |

The app is **dark-only**: `<html class="dark">`, and the slate/amber palette from the mockup is mapped onto shadcn tokens. There is no theme switcher.

---

## 4. Project structure

```text
src/
  app/
    layout.tsx                 Root shell: font, <StoreHydrator/>, <Navigation/>, <Toaster/>
    page.tsx                   Dashboard
    globals.css                Tailwind v4 + shadcn tokens (dark slate/amber) + utilities (.pb-nav, .safe-bottom)
    icon.svg                   Favicon
    not-found.tsx              Localized 404
    library/
      page.tsx                 Library: search, filters, sort, grid/table, empty states
      add/page.tsx             Add Book (BookForm)
      [id]/page.tsx            Book detail: status, progress, rating, notes, tags, collections, delete
      [id]/edit/page.tsx       Edit Book (same BookForm)
    collections/
      page.tsx                 Collection list + create
      [id]/page.tsx            Collection detail: add/remove books, rename, delete
    settings/page.tsx          Language + Reset Demo Data
  components/
    app-shell/navigation.tsx   Desktop sidebar, mobile header, mobile bottom nav (5 tabs)
    app-shell/language-toggle.tsx
    books/                     badges, book-card, book-form, book-collections, progress-control, rating-input, tag-editor
    collections/               collection-dialog (create/rename), collection-color (literal Tailwind classes)
    dashboard/update-reading-sheet.tsx   "Update Reading" quick action (bottom sheet)
    library/library-filters.tsx          Search + mobile filter sheet + desktop inline filters
    confirm-dialog.tsx         Destructive confirmation (controlled or trigger-based)
    option-select.tsx          Single-value select wrapper (shows labels, 44px on mobile)
    page.tsx                   PageContainer, PageHeader, EmptyState, PageSkeleton
    store-hydrator.tsx         Rehydrates stores after mount + useHydrated() gate
    ui/                        shadcn-generated components (edit sparingly)
  data/                        books.ts (24 seed books), categories.ts, collections.ts
  i18n/                        en.ts (source of truth + Dictionary type), ms.ts, index.ts (useT)
  lib/library.ts               Pure domain logic: status rules, filters, sort, stats, tag parsing
  lib/utils.ts                 cn, sliderValue
  store/library-store.ts       Books, collections, categories + all mutations
  store/preferences-store.ts   Locale + library view (survives "Reset Demo Data")
  types/library.ts             Book, Collection, Category + enum tuples
design/mockup.html             Phase 1 static mockup (reference only)
```

Path alias: `@/*` → `src/*`.

---

## 5. Architecture

### 5.1 Data model (`src/types/library.ts`)

`Book`:
- **Identity and basics:** `id`, `title`, `author`, optional `isbn`, `publisher`, `publicationYear`.
- **Classification:** `language` (`'English' | 'Bahasa Melayu'`), `category` (by name), `owner` (`'Alep' | 'Taqim'`), `location`.
- **Reading:** `status` (`'want_to_read' | 'reading' | 'completed'`), `progress` (0–100), optional `rating` (1–5).
- **Purchase:** optional `price` (RM), `purchaseDate` (YYYY-MM-DD).
- **Personal:** optional `notes`, `tags[]`, `collectionIds[]`.
- **Metadata:** `addedAt` (ISO).

A book can belong to **several collections** (`collectionIds: string[]`). Antigravity's earlier draft used a single `collectionId`.

The enum values are exported as tuples (`READING_STATUSES`, `BOOK_LANGUAGES`, `OWNERS`), so Zod schemas, selects and URL parsing all share one list.

### 5.2 Persistence and hydration (important)

- Two persisted stores:
  - `lib-ax:library`: books, collections, categories
  - `lib-ax:preferences`: locale, libraryView
- Both are created with `skipHydration: true`. `<StoreHydrator/>` (rendered in the root layout) calls `persist.rehydrate()` in a layout effect.
- Every store-backed page renders `<PageSkeleton/>` until `useHydrated()` is true.

**Why:** the server renders before `localStorage` exists. Without this gate, a refresh on a user-added book (`/library/<new-id>`) would render "Book not found" on the server, cause a React hydration mismatch, then flash. With the gate, server HTML and the first client render are both the skeleton, and the real data appears a few milliseconds later. Verified: zero console errors or warnings across all flows.

**Reset Demo Data** (Settings) calls `resetDemoData()`, which restores `SEED_*` via `structuredClone`. Preferences are a separate store, so the language survives a reset.

If you change the persisted shape, bump `version` in the store options and add a `migrate` function. The current version is `1`.

### 5.3 Domain rules (`src/lib/library.ts`)

All business logic is pure and lives here, not in components:

| Function | Rule |
|---|---|
| `applyStatus(book, status)` | Explicit status change. `want_to_read` → progress 0. `completed` → progress 100. `reading` from `completed` → 0 (a re-read), otherwise keeps progress. |
| `applyProgress(book, n)` | Clamps 0–100. Moving progress above 0 on a want-to-read book makes it `reading`. Dropping below 100 on a completed book makes it `reading`. **Never auto-completes.** At 100% the UI shows "Mark completed?" (`isReadyToComplete`). |
| `reconcileStatus(book)` | Used for full-form edits and adds, where status and progress arrive together. It only enforces the invariants (want = 0, completed = 100). It does **not** reset a completed→reading edit to 0. |
| `filterAndSortBooks(books, filters)` | Search covers title, author and ISBN (ISBN ignores dashes and spaces). Status, category, language and owner filters all combine. Sorts: recent, title, author, progress, rating. |
| `filtersFromSearchParams` / `filtersToSearchParams` | URL ⇄ filter state, with values validated against the enum tuples. |
| `libraryStats`, `currentlyReading`, `recentlyAdded` | Dashboard figures. Nothing on the dashboard is hard-coded. |
| `parseTags` | Comma input → unique tags (case-insensitive), keeping the **first** spelling. |

IDs come from `Date.now()` plus a random suffix. They deliberately **don't** use `crypto.randomUUID()`, which is undefined on plain-HTTP LAN origins (e.g. testing on a phone at `http://192.168.x.x:8080`).

### 5.4 Library filters live in the URL

- `/library?q=…&status=…&category=…&language=…&owner=…&sort=…`. Default values are left out of the URL.
- Updates use **native** `window.history.pushState` / `replaceState`, not `router.push`. Next 14.1+ syncs those with `useSearchParams` and skips the route transition, so results update on every keystroke.
  - Typing uses `replaceState`, so typing doesn't add history entries.
  - A discrete filter change uses `pushState`, so Back undoes it.
- `LibraryView` sits inside `<Suspense>`, which Next requires for `useSearchParams`.
- On mobile, filters open in a **bottom sheet** (Drawer) that edits a **draft**. "Show N books" applies it and "Reset" clears the draft. The quick status chips stay visible outside the sheet.
- On desktop, filters are inline. Grid vs table view is a persisted preference. The table only renders at `md+`; on mobile it always falls back to cards.

### 5.5 i18n (`src/i18n`)

- `en.ts` is the source of truth, and `Dictionary = typeof en`. `ms.ts` is typed `Dictionary`, so **a missing or mistyped Malay key fails `tsc`**.
- Values can be functions for plurals and interpolation (`t.common.books(n)`, `t.book.deleteBody(title)`).
- `useT()` returns `{ locale, t, formatPrice, formatDate }`. These use `Intl` with `en-MY` / `ms-MY` and the `MYR` currency.
- `<html lang>` follows the locale (set in `StoreHydrator`).
- **Not translated by design:** user data (book titles, category names, collection names, owner names).

### 5.6 UI conventions

- **Mobile first** (ymeer's rules):
  - Touch targets are **≥ 44px** on mobile, shrinking at `md:` (e.g. `h-11 md:h-9`).
  - One-column forms with a **sticky submit bar** that sits above the bottom nav.
  - Bottom nav plus `env(safe-area-inset-bottom)`; content uses the `.pb-nav` padding.
  - Bottom sheets for filters and quick actions.
- **Links styled as buttons:** use `<Link className={buttonVariants(...)}>`. Don't wrap a Link in a Base UI `Button`; Base UI says not to.
- **Feedback:** sonner toasts for meaningful changes only (add, update, delete, progress, complete, notes, collections, reset). Progress toasts reuse an id per book so dragging doesn't stack them.
- **Destructive actions** (delete book, delete collection, reset data) always go through `ConfirmDialog`.
- **Long titles and names** use `truncate` / `line-clamp-2` / `break-words` plus `min-w-0`. Verified with an 80-character title at 360px.

---

## 6. Routes and what works

| Route | Features |
|---|---|
| `/` | Live stats (total, RM value + average, owner split, status strip linking to the filtered library), Currently Reading (top 4 by progress, inline slider), Recently Added (5), quick actions: Add Book / Browse Library / **Update Reading** (sheet with a progress slider for each reading book) |
| `/library` | Search, status chips, category / language / owner filters, 5 sorts, grid/table view, empty-library and no-results states |
| `/library/add` | RHF + Zod form with localized errors. Title and Author are required. ISBN must be 10 or 13 digits, year 1000 to next year, price ≥ 0. Tags are comma-separated. Collections are toggle chips. Location defaults to `Library <owner>`. |
| `/library/[id]` | Status segmented control, progress slider + 0/25/50/75/100 steps, "Mark completed?" prompt at 100%, 1–5 star rating (tap the current star to clear), details, collection membership (add via menu, remove via chip ×), tag add/remove, notes editor, Edit, Delete (confirm → back to the library with no "not found" flash) |
| `/library/[id]/edit` | Same form, prefilled. Updates in place (same id, no duplicate). |
| `/collections` | Cards with colour accent, book count and preview. Create dialog (name required, description, 5 colours). |
| `/collections/[id]` | Member list with remove ×, "Add books" searchable sheet, ⋮ menu → Rename / Delete. The dialogs sit **outside** the menu (see §8). |
| `/settings` | EN/BM toggle, Reset Demo Data (with confirmation), local storage stats |

**Navigation:** desktop sidebar (with book count and language toggle), mobile header (with language toggle), and a mobile bottom nav with Home · Library · Add · Collections · Settings. The active state comes from the pathname.

---

## 7. Verification done (2026-10-05)

All on a production build (`next build && next start`), driven with Playwright:

- **Brief acceptance flows A–G:**
  - **A:** add → appears in the library → dashboard updates
  - **B:** set to Reading at 50% → shows in Currently Reading
  - **C:** 100% → "Mark completed?" → Completed count +1
  - **D:** search + status + language + sort combine, all in the URL; refresh keeps them; Back restores the previous filter state
  - **E:** edit updates in place, and status/progress/rating are kept
  - **F:** delete → confirm → gone → stats update
  - **G:** switch to BM → the whole UI is Malay → survives a refresh
- **Collections:** create (including the empty-name validation), add books via the sheet, rename (prefilled), remove a book, delete. Reset Demo Data restores 24 books and 4 collections.
- **Hydration:** a hard refresh onto a newly added book's page renders it directly. **0 console errors or warnings** across the run.
- **Responsive QA:**
  - 108 checks: 360×800, 390×844, 430×932, 768×1024, 1280×800 and 1440×900, × 9 routes × EN/BM
  - **No horizontal overflow** anywhere
  - Mobile tap targets ≥ 36–44px. The only sub-36px hits are Base UI's hidden `<input type=range>` elements behind the sliders, which aren't tap targets.
- **Quality gates:** `npm run lint` and `npm run typecheck` are clean, and `next build` succeeds.
- **Docker:** the image builds and serves `/library` (200) on a smoke-test port, as user `nextjs`.

There are **no automated tests in the repo yet** (see §9).

---

## 8. Gotchas (each cost real time; don't repeat them)

1. **shadcn `Slider` needs an array:** `value={[n]}`. A bare number makes the wrapper fall back to `[min, max]` and render **two thumbs**. Callbacks return `number | number[]`, so use `sliderValue(v)` from `@/lib/utils`.
2. **Base UI, not Radix.** Compose with the `render` prop (`<DialogTrigger render={<Button/>} />`), not `asChild`. Select labels come from the `items` prop. Docs ship in `node_modules/@base-ui/react/docs/`.
3. **Dialogs opened from a dropdown menu** must not be nested inside the menu. Doing so left the menu open after the dialog closed, and it blocked clicks on the page. The pattern: the menu item sets state, and `CollectionDialog` / `ConfirmDialog` render as siblings with `open` and `onOpenChange` (both components support controlled and trigger modes).
4. **`AlertDialogAction` doesn't close the dialog** (it's a plain Button in this preset). `ConfirmDialog` manages `open` itself.
5. **Select trigger height:** shadcn's `data-[size=default]:h-8` beats a plain `h-11`. Override the same selector (`data-[size=default]:h-11`), as `OptionSelect` does.
6. **ESLint 10 breaks `eslint-plugin-react`**, which `eslint-config-next` bundles (`contextOrFilename.getFilename is not a function`). Stay on ESLint 9 until that's fixed upstream.
7. **React Hook Form `watch()`** triggers the React Compiler "incompatible library" lint warning. Use `useWatch({ control, name })`.
8. **`<legend>` sits on the fieldset border.** Form legends use `float-left w-full` and the following group uses `clear-both`.
9. **Collection colours** are a literal class map (`collection-color.ts`). Tailwind can't see dynamically built class names.
10. **`next/font` in Docker** needs network access at build time.

---

## 9. Known gaps / next steps (suggested priority)

1. **Real seed data.** The brief says the seed should come from the *Library of Alexandria Excel workbook*. It wasn't available when this was built, so `src/data/books.ts` holds 24 realistic placeholders in the same shape. When you get the workbook, export it and replace `SEED_BOOKS`. Keep the `Book` shape; if fields differ, extend the type, form, schema and both dictionaries together.
2. **Automated tests.** Turn §7 into a Playwright e2e suite (flows A–G + collections + responsive overflow check) and add unit tests for `src/lib/library.ts`.
3. **Location filter and "Move" action.** ymeer's design notes mention filtering by **Location** and a **Move** action on the detail page. Today location can only be changed via Edit, and there's no location filter.
4. **Categories are a fixed list** (`SEED_CATEGORIES`). There's no UI to add or rename categories yet.
5. **Owner change doesn't update the location.** If a book moves from Alep to Taqim via Edit, its location string stays the same. Decide whether location should follow the owner.
6. **Covers and images** are out of scope until phase 3 (no uploads).
7. **Phase 3 backend:** the store actions in `library-store.ts` are the natural seam to swap for API calls. The pure functions in `lib/library.ts` can stay as they are.

---

## 10. Working agreements (from the repo owner)

- **Commits:** conventional style with no scope (`feat: …`, `fix: …`), and no AI attribution lines.
- **Commit and push only with an explicit go-ahead.** Show the diff first.
- **Mobile is the source of truth.** Design for 360–412px first, then enhance up. No horizontal scrolling, no hover-only interactions, touch targets ≥ 44px.
- **Don't redesign the UI** unless usability requires it. The look follows `design/mockup.html`.
- **Verify in a real browser** before calling something done, and report what was actually tested.
