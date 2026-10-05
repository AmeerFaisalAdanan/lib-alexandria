import {
  BOOK_LANGUAGES,
  OWNERS,
  READING_STATUSES,
  type Book,
  type BookLanguage,
  type BookOwner,
  type ReadingStatus,
} from '@/types/library';

// ---------------------------------------------------------------- status rules

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

/** Changing status keeps progress consistent: want → 0%, completed → 100%, restarting a finished book → 0%. */
export function applyStatus<T extends Pick<Book, 'status' | 'progress'>>(book: T, status: ReadingStatus): T {
  if (status === 'want_to_read') return { ...book, status, progress: 0 };
  if (status === 'completed') return { ...book, status, progress: 100 };
  return { ...book, status, progress: book.status === 'completed' ? 0 : clamp(book.progress) };
}

/**
 * Progress moves a book into "reading" when it starts (or is rewound from completed),
 * but never auto-completes it: at 100% the UI asks the reader to confirm completion.
 */
export function applyProgress<T extends Pick<Book, 'status' | 'progress'>>(book: T, progress: number): T {
  const next = clamp(progress);
  if (book.status === 'want_to_read' && next > 0) return { ...book, progress: next, status: 'reading' };
  if (book.status === 'completed' && next < 100) return { ...book, progress: next, status: 'reading' };
  return { ...book, progress: next };
}

/** For full edits (form) where status and progress arrive together: enforce the invariants only. */
export function reconcileStatus<T extends Pick<Book, 'status' | 'progress'>>(book: T): T {
  if (book.status === 'want_to_read') return { ...book, progress: 0 };
  if (book.status === 'completed') return { ...book, progress: 100 };
  return { ...book, progress: clamp(book.progress) };
}

export const isReadyToComplete = (book: Pick<Book, 'status' | 'progress'>) =>
  book.status === 'reading' && book.progress >= 100;

export const normaliseTag = (tag: string) => tag.trim().replace(/\s+/g, ' ').slice(0, 32);

/** Comma-separated input → unique tags (case-insensitive), keeping the first spelling. */
export function parseTags(input: string) {
  const seen = new Map<string, string>();
  for (const tag of input.split(',').map(normaliseTag).filter(Boolean)) {
    if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  }
  return [...seen.values()];
}

// ------------------------------------------------------------- filter + sort

export const SORT_KEYS = ['recent', 'title', 'author', 'progress', 'rating'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface LibraryFilters {
  q: string;
  status: ReadingStatus | 'all';
  category: string | 'all';
  language: BookLanguage | 'all';
  owner: BookOwner | 'all';
  sort: SortKey;
}

export const DEFAULT_FILTERS: LibraryFilters = {
  q: '',
  status: 'all',
  category: 'all',
  language: 'all',
  owner: 'all',
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
    language: oneOf(BOOK_LANGUAGES, params.get('language')) ?? 'all',
    owner: oneOf(OWNERS, params.get('owner')) ?? 'all',
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
  (['status', 'category', 'language', 'owner'] as const).filter((k) => f[k] !== 'all').length;

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

const comparators: Record<SortKey, (a: Book, b: Book) => number> = {
  recent: (a, b) => b.addedAt.localeCompare(a.addedAt),
  title: (a, b) => a.title.localeCompare(b.title),
  author: (a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title),
  progress: (a, b) => b.progress - a.progress || a.title.localeCompare(b.title),
  rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title),
};

export function filterAndSortBooks(books: Book[], f: LibraryFilters): Book[] {
  return books
    .filter(
      (b) =>
        matchesQuery(b, f.q) &&
        (f.status === 'all' || b.status === f.status) &&
        (f.category === 'all' || b.category === f.category) &&
        (f.language === 'all' || b.language === f.language) &&
        (f.owner === 'all' || b.owner === f.owner),
    )
    .sort(comparators[f.sort]);
}

// --------------------------------------------------------------------- stats

export function libraryStats(books: Book[]) {
  const byStatus = Object.fromEntries(READING_STATUSES.map((s) => [s, 0])) as Record<ReadingStatus, number>;
  const byOwner = Object.fromEntries(OWNERS.map((o) => [o, 0])) as Record<BookOwner, number>;
  let value = 0;
  for (const b of books) {
    byStatus[b.status] += 1;
    byOwner[b.owner] += 1;
    value += b.price ?? 0;
  }
  return {
    total: books.length,
    byStatus,
    byOwner,
    value,
    avgPrice: books.length ? value / books.length : 0,
  };
}

export const recentlyAdded = (books: Book[], limit = 5) => [...books].sort(comparators.recent).slice(0, limit);

export const currentlyReading = (books: Book[]) =>
  books.filter((b) => b.status === 'reading').sort((a, b) => b.progress - a.progress);
