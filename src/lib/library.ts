import { READING_STATUSES, type Book, type Copy, type LibraryBook, type Person, type ReadingStatus, type UserBook } from '@/types/library';

type Progressing = Pick<UserBook, 'status' | 'progress'>;

// ---------------------------------------------------------------- status rules
// The backend applies the same rules and is authoritative; these run on the client for instant feedback.

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

/** Changing status keeps progress consistent: want → 0%, completed → 100%, restarting a finished book → 0%. */
export function applyStatus<T extends Progressing>(book: T, status: ReadingStatus): T {
  if (status === 'want_to_read') return { ...book, status, progress: 0 };
  if (status === 'completed') return { ...book, status, progress: 100 };
  return { ...book, status, progress: book.status === 'completed' ? 0 : clamp(book.progress) };
}

/**
 * Progress moves a book into "reading" when it starts (or is rewound from completed),
 * but never auto-completes it: at 100% the UI asks the reader to confirm completion.
 */
export function applyProgress<T extends Progressing>(book: T, progress: number): T {
  const next = clamp(progress);
  if (book.status === 'want_to_read' && next > 0) return { ...book, progress: next, status: 'reading' };
  if (book.status === 'completed' && next < 100) return { ...book, progress: next, status: 'reading' };
  return { ...book, progress: next };
}

/** For full edits (form) where status and progress arrive together: enforce the invariants only. */
export function reconcileStatus<T extends Progressing>(book: T): T {
  if (book.status === 'want_to_read') return { ...book, progress: 0 };
  if (book.status === 'completed') return { ...book, progress: 100 };
  return { ...book, progress: clamp(book.progress) };
}

export const isReadyToComplete = (book: Progressing) => book.status === 'reading' && book.progress >= 100;

export const normaliseTag = (tag: string) => tag.trim().replace(/\s+/g, ' ').slice(0, 32);

/** Comma-separated input → unique tags (case-insensitive), keeping the first spelling. */
export function parseTags(input: string) {
  const seen = new Map<string, string>();
  for (const tag of input.split(',').map(normaliseTag).filter(Boolean)) {
    if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  }
  return [...seen.values()];
}

/** Writable personal fields. `null` clears an optional value (same contract as PATCH /api/my/library/:bookId). */
export interface EntryPatch {
  status?: ReadingStatus;
  progress?: number;
  rating?: number | null;
  notes?: string;
  tags?: string[];
}

type Patchable = Progressing & Pick<UserBook, 'rating' | 'notes' | 'tags'>;

/** Optimistic version of what the server does with a PATCH. */
export function applyEntryPatch<T extends Patchable>(entry: T, patch: EntryPatch): T {
  let next: T = { ...entry };
  if (patch.status !== undefined && patch.progress !== undefined) {
    next = reconcileStatus({ ...next, status: patch.status, progress: patch.progress });
  } else if (patch.status !== undefined) {
    next = applyStatus(next, patch.status);
  } else if (patch.progress !== undefined) {
    next = applyProgress(next, patch.progress);
  }
  if (patch.rating !== undefined) next.rating = patch.rating ?? undefined;
  if (patch.notes !== undefined) next.notes = patch.notes.trim();
  if (patch.tags !== undefined) next.tags = patch.tags;
  return next;
}

// ------------------------------------------------------------- filter + sort

export const SORT_KEYS = ['recent', 'title', 'author', 'progress', 'rating'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface LibraryFilters {
  q: string;
  status: ReadingStatus | 'all';
  category: string | 'all';
  language: string | 'all';
  sort: SortKey;
}

export const DEFAULT_FILTERS: LibraryFilters = {
  q: '',
  status: 'all',
  category: 'all',
  language: 'all',
  sort: 'recent',
};

const oneOf = <T extends string>(list: readonly T[], value: string | null): T | undefined =>
  value && (list as readonly string[]).includes(value) ? (value as T) : undefined;

/** Filters live in the URL so refresh and back/forward keep them. */
export function filtersFromSearchParams(params: URLSearchParams): LibraryFilters {
  return {
    q: params.get('q') ?? '',
    status: oneOf(READING_STATUSES, params.get('status')) ?? 'all',
    category: params.get('category') || 'all',
    language: params.get('language') || 'all',
    sort: oneOf(SORT_KEYS, params.get('sort')) ?? 'recent',
  };
}

export function filtersToSearchParams(filters: LibraryFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters) as [keyof LibraryFilters, string][]) {
    if (value && value !== DEFAULT_FILTERS[key]) params.set(key, value);
  }
  return params;
}

/** Number of narrowing filters in use (search and sort excluded). */
export const countActiveFilters = (f: LibraryFilters) =>
  (['status', 'category', 'language'] as const).filter((k) => f[k] !== 'all').length;

const matchesQuery = (book: Book, q: string) => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const isbnNeedle = needle.replace(/[-\s]/g, '');
  return (
    book.title.toLowerCase().includes(needle) ||
    book.author.toLowerCase().includes(needle) ||
    (!!isbnNeedle && !!book.isbn && book.isbn.includes(isbnNeedle))
  );
};

const comparators: Record<SortKey, (a: LibraryBook, b: LibraryBook) => number> = {
  recent: (a, b) => b.addedAt.localeCompare(a.addedAt),
  title: (a, b) => a.title.localeCompare(b.title),
  author: (a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title),
  progress: (a, b) => b.progress - a.progress || a.title.localeCompare(b.title),
  rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title),
};

export function filterAndSortBooks(books: LibraryBook[], f: LibraryFilters): LibraryBook[] {
  return books
    .filter(
      (b) =>
        matchesQuery(b, f.q) &&
        (f.status === 'all' || b.status === f.status) &&
        (f.category === 'all' || b.category === f.category) &&
        (f.language === 'all' || b.language === f.language),
    )
    .sort(comparators[f.sort]);
}

/** Catalogue search (no personal state): title, author or ISBN. */
export function searchCatalogue(books: Book[], q: string, category: string | 'all' = 'all'): Book[] {
  return books
    .filter((b) => matchesQuery(b, q) && (category === 'all' || b.category === category))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

// --------------------------------------------------------------------- stats

export function libraryStats(books: LibraryBook[]) {
  const byStatus = Object.fromEntries(READING_STATUSES.map((s) => [s, 0])) as Record<ReadingStatus, number>;
  let readingProgress = 0;
  for (const b of books) {
    byStatus[b.status] += 1;
    if (b.status === 'reading') readingProgress += b.progress;
  }
  const total = books.length;
  return {
    total,
    byStatus,
    avgProgress: byStatus.reading ? Math.round(readingProgress / byStatus.reading) : 0,
    finishedPct: total ? Math.round((byStatus.completed / total) * 100) : 0,
  };
}

export const recentlyAdded = (books: LibraryBook[], limit = 5) => [...books].sort(comparators.recent).slice(0, limit);

export const currentlyReading = (books: LibraryBook[]) =>
  books.filter((b) => b.status === 'reading').sort((a, b) => b.progress - a.progress);

// ------------------------------------------------------------ copies and lending

export const personName = (p: Person) => p.name || p.email;

/** What the signed-in user has paid for the copies they own (prices of other people's copies are never sent). */
export function spendOn(copies: Copy[], meId: string) {
  let spend = 0;
  let priced = 0;
  for (const c of copies) {
    if (c.owner.id === meId && c.price !== undefined) {
      spend += c.price;
      priced += 1;
    }
  }
  return { spend, avgPrice: priced ? spend / priced : 0 };
}

export const LENDING_VIEWS = ['out', 'borrowed', 'lent', 'available'] as const;
export type LendingView = (typeof LENDING_VIEWS)[number];

/** Copies on loan right now are "out"; "borrowed" = I have them; "lent" = mine, held by someone else. */
export function lendingView(copies: Copy[], view: LendingView, meId: string): Copy[] {
  const list = copies.filter((c) => {
    switch (view) {
      case 'out':
        return c.loan !== null;
      case 'borrowed':
        return c.loan?.borrower.id === meId;
      case 'lent':
        return c.owner.id === meId && c.loan !== null;
      case 'available':
        return c.loan === null;
    }
  });
  return list.sort((a, b) =>
    view === 'available'
      ? a.book.title.localeCompare(b.book.title)
      : (a.loan?.borrowedAt ?? '').localeCompare(b.loan?.borrowedAt ?? '') * -1 || a.book.title.localeCompare(b.book.title),
  );
}

/** Due date (YYYY-MM-DD) before today (local time). */
export function isOverdue(copy: Copy, now = new Date()): boolean {
  const due = copy.loan?.dueAt;
  if (!due) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return due < today;
}
