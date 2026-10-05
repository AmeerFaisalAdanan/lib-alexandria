import { describe, expect, it } from 'vitest';
import {
  applyEntryPatch,
  applyProgress,
  applyStatus,
  countActiveFilters,
  currentlyReading,
  DEFAULT_FILTERS,
  distinct,
  filterAndSortBooks,
  filtersFromSearchParams,
  filtersToSearchParams,
  isOverdue,
  isReadyToComplete,
  lendingView,
  libraryStats,
  parseTags,
  reconcileStatus,
  recentlyAdded,
  searchCatalogue,
  spendOn,
} from '@/lib/library';
import type { Book, Copy, LibraryBook, Person } from '@/types/library';

const make = (over: Partial<LibraryBook> = {}): LibraryBook => ({
  id: 'b1',
  title: 'Ihya Ulum al-Din',
  author: 'Al-Ghazali',
  language: 'English',
  category: 'Kitab Turath',
  status: 'want_to_read',
  progress: 0,
  notes: '',
  tags: [],
  addedAt: '2026-01-01T00:00:00Z',
  collectionIds: [],
  ...over,
});

describe('applyStatus', () => {
  it('want_to_read resets progress to 0', () => {
    expect(applyStatus(make({ status: 'reading', progress: 40 }), 'want_to_read')).toMatchObject({ status: 'want_to_read', progress: 0 });
  });
  it('completed forces 100', () => {
    expect(applyStatus(make({ status: 'reading', progress: 40 }), 'completed')).toMatchObject({ status: 'completed', progress: 100 });
  });
  it('re-reading a finished book restarts at 0', () => {
    expect(applyStatus(make({ status: 'completed', progress: 100 }), 'reading')).toMatchObject({ status: 'reading', progress: 0 });
  });
  it('reading keeps existing progress', () => {
    expect(applyStatus(make({ status: 'reading', progress: 30 }), 'reading').progress).toBe(30);
  });
});

describe('applyProgress', () => {
  it('starting a want-to-read book moves it to reading', () => {
    expect(applyProgress(make(), 10)).toMatchObject({ status: 'reading', progress: 10 });
  });
  it('zero keeps want-to-read', () => {
    expect(applyProgress(make(), 0)).toMatchObject({ status: 'want_to_read', progress: 0 });
  });
  it('never auto-completes at 100%', () => {
    const next = applyProgress(make({ status: 'reading', progress: 50 }), 100);
    expect(next).toMatchObject({ status: 'reading', progress: 100 });
    expect(isReadyToComplete(next)).toBe(true);
  });
  it('rewinding a completed book returns it to reading', () => {
    expect(applyProgress(make({ status: 'completed', progress: 100 }), 80)).toMatchObject({ status: 'reading', progress: 80 });
  });
  it('clamps out-of-range values', () => {
    expect(applyProgress(make({ status: 'reading', progress: 10 }), 250).progress).toBe(100);
    expect(applyProgress(make({ status: 'reading', progress: 10 }), -4).progress).toBe(0);
  });
});

describe('reconcileStatus', () => {
  it('enforces invariants without resetting a completed → reading edit', () => {
    expect(reconcileStatus(make({ status: 'want_to_read', progress: 60 })).progress).toBe(0);
    expect(reconcileStatus(make({ status: 'completed', progress: 20 })).progress).toBe(100);
    expect(reconcileStatus(make({ status: 'reading', progress: 100 }))).toMatchObject({ status: 'reading', progress: 100 });
    expect(reconcileStatus(make({ status: 'reading', progress: 33 })).progress).toBe(33);
  });
});

describe('applyEntryPatch (optimistic mirror of the server)', () => {
  it('status + progress together reconcile', () => {
    expect(applyEntryPatch(make(), { status: 'reading', progress: 40 })).toMatchObject({ status: 'reading', progress: 40 });
    expect(applyEntryPatch(make(), { status: 'completed', progress: 5 })).toMatchObject({ status: 'completed', progress: 100 });
  });
  it('progress alone uses the progress rules', () => {
    expect(applyEntryPatch(make(), { progress: 25 })).toMatchObject({ status: 'reading', progress: 25 });
  });
  it('null clears optional fields, undefined leaves them', () => {
    const base = make({ rating: 4, notes: 'keep' });
    expect(applyEntryPatch(base, { rating: null })).toMatchObject({ rating: undefined, notes: 'keep' });
    expect(applyEntryPatch(base, {}).rating).toBe(4);
  });
  it('trims notes and replaces tags', () => {
    expect(applyEntryPatch(make(), { notes: '  hi  ', tags: ['a'] })).toMatchObject({ notes: 'hi', tags: ['a'] });
  });
  it('does not mutate its input', () => {
    const base = make();
    applyEntryPatch(base, { status: 'completed' });
    expect(base.status).toBe('want_to_read');
  });
});

describe('parseTags', () => {
  it('splits, trims, de-duplicates case-insensitively keeping the first spelling', () => {
    expect(parseTags(' Fiqh, fiqh ,Spiritual   Growth,, ')).toEqual(['Fiqh', 'Spiritual Growth']);
  });
  it('caps tag length at 32', () => {
    expect(parseTags('x'.repeat(50))[0]).toHaveLength(32);
  });
});

describe('filterAndSortBooks', () => {
  const books = [
    make({ id: 'a', title: 'Alpha', author: 'Zed', isbn: '9789670000015', status: 'reading', progress: 70, language: 'Bahasa Melayu', category: 'Fiqh', addedAt: '2026-03-01T00:00:00Z', rating: 3 }),
    make({ id: 'b', title: 'Bravo', author: 'Amy', status: 'completed', progress: 100, category: 'Hadith', addedAt: '2026-01-01T00:00:00Z', rating: 5 }),
    make({ id: 'c', title: 'Charlie', author: 'Amy', status: 'reading', progress: 20, category: 'Fiqh', addedAt: '2026-02-01T00:00:00Z' }),
  ];
  const ids = (f: Partial<typeof DEFAULT_FILTERS>) => filterAndSortBooks(books, { ...DEFAULT_FILTERS, ...f }).map((b) => b.id);

  it('searches title, author and ISBN (ignoring dashes)', () => {
    expect(ids({ q: 'alp' })).toEqual(['a']);
    expect(ids({ q: 'amy', sort: 'title' })).toEqual(['b', 'c']);
    expect(ids({ q: '978-967-0000-015' })).toEqual(['a']);
  });
  it('combines status, category and language filters', () => {
    expect(ids({ status: 'reading', category: 'Fiqh', sort: 'title' })).toEqual(['a', 'c']);
    expect(ids({ status: 'reading', language: 'Bahasa Melayu' })).toEqual(['a']);
    expect(ids({ status: 'completed', category: 'Fiqh' })).toEqual([]);
  });
  it('sorts', () => {
    expect(ids({ sort: 'recent' })).toEqual(['a', 'c', 'b']);
    expect(ids({ sort: 'progress' })).toEqual(['b', 'a', 'c']);
    expect(ids({ sort: 'rating' })).toEqual(['b', 'a', 'c']);
    expect(ids({ sort: 'author' })).toEqual(['b', 'c', 'a']);
  });
});

describe('URL filter state', () => {
  it('round-trips and omits defaults', () => {
    const f = { ...DEFAULT_FILTERS, q: 'hadith', status: 'reading' as const, sort: 'title' as const };
    const qs = filtersToSearchParams(f).toString();
    expect(qs).toBe('q=hadith&status=reading&sort=title');
    expect(filtersFromSearchParams(new URLSearchParams(qs))).toEqual(f);
  });
  it('ignores invalid enum values and the retired owner param', () => {
    const f = filtersFromSearchParams(new URLSearchParams('status=nope&sort=weird&owner=Alep'));
    expect(f).toEqual(DEFAULT_FILTERS);
    expect(filtersToSearchParams(f).toString()).toBe('');
  });
  it('counts narrowing filters only', () => {
    expect(countActiveFilters({ ...DEFAULT_FILTERS, q: 'x', sort: 'title' })).toBe(0);
    expect(countActiveFilters({ ...DEFAULT_FILTERS, status: 'reading', category: 'Fiqh' })).toBe(2);
  });
});

describe('libraryStats', () => {
  it('is empty-safe', () => {
    expect(libraryStats([])).toMatchObject({ total: 0, avgProgress: 0, finishedPct: 0 });
  });
  it('counts statuses and reading progress', () => {
    const stats = libraryStats([
      make({ id: '1', status: 'reading', progress: 40 }),
      make({ id: '2', status: 'reading', progress: 60 }),
      make({ id: '3', status: 'completed', progress: 100 }),
      make({ id: '4' }),
    ]);
    expect(stats.total).toBe(4);
    expect(stats.byStatus).toEqual({ want_to_read: 1, reading: 2, completed: 1 });
    expect(stats.avgProgress).toBe(50);
    expect(stats.finishedPct).toBe(25);
  });
  it('currentlyReading is ordered by progress; recentlyAdded by date', () => {
    const books = [
      make({ id: 'x', status: 'reading', progress: 10, addedAt: '2026-01-01T00:00:00Z' }),
      make({ id: 'y', status: 'reading', progress: 90, addedAt: '2026-02-01T00:00:00Z' }),
      make({ id: 'z', addedAt: '2026-03-01T00:00:00Z' }),
    ];
    expect(currentlyReading(books).map((b) => b.id)).toEqual(['y', 'x']);
    expect(recentlyAdded(books, 2).map((b) => b.id)).toEqual(['z', 'y']);
  });
});

describe('catalogue helpers', () => {
  const catalogue: Book[] = [
    { id: '1', title: 'Beta', author: 'A', language: 'English', category: 'Fiqh', isbn: '1234567890' },
    { id: '2', title: 'Alpha', author: 'B', language: 'English', category: 'Hadith' },
  ];
  it('searches and sorts by title', () => {
    expect(searchCatalogue(catalogue, '').map((b) => b.id)).toEqual(['2', '1']);
    expect(searchCatalogue(catalogue, '', 'Fiqh').map((b) => b.id)).toEqual(['1']);
    expect(searchCatalogue(catalogue, '12345').map((b) => b.id)).toEqual(['1']);
  });
  it('distinct drops blanks and sorts', () => {
    expect(distinct(['b', 'a', '', 'b'])).toEqual(['a', 'b']);
  });
});

describe('copies and lending', () => {
  const person = (id: string): Person => ({ id, email: `${id}@x.test`, name: id });
  const copy = (id: string, owner: string, over: Partial<Copy> = {}): Copy => ({
    id,
    book: { id: `b-${id}`, title: `Book ${id}`, author: 'A', language: 'English', category: 'C' },
    owner: person(owner),
    createdAt: '2026-01-01T00:00:00Z',
    loan: null,
    ...over,
  });
  const loan = (borrower: string, borrowedAt: string, dueAt?: string) => ({ id: `l-${borrower}-${borrowedAt}`, borrower: person(borrower), borrowedAt, dueAt });

  const copies = [
    copy('1', 'me', { price: 40 }),
    copy('2', 'me', { price: 10, loan: loan('amy', '2026-02-01T00:00:00Z', '2026-02-20') }),
    copy('3', 'amy', { loan: loan('me', '2026-03-01T00:00:00Z') }),
    copy('4', 'amy'),
    copy('5', 'bob', { loan: loan('amy', '2026-01-15T00:00:00Z') }),
  ];

  it('spendOn only counts the viewer’s own priced copies', () => {
    expect(spendOn(copies, 'me')).toEqual({ spend: 50, avgPrice: 25 });
    expect(spendOn(copies, 'amy')).toEqual({ spend: 0, avgPrice: 0 });
  });

  it('lendingView splits the shared shelf by who is involved', () => {
    const ids = (v: Parameters<typeof lendingView>[1]) => lendingView(copies, v, 'me').map((c) => c.id);
    expect(ids('out')).toEqual(['3', '2', '5']); // newest loan first
    expect(ids('borrowed')).toEqual(['3']);
    expect(ids('lent')).toEqual(['2']);
    expect(ids('available')).toEqual(['1', '4']);
  });

  it('isOverdue compares the due date with today, and ignores copies without one', () => {
    const now = new Date(2026, 1, 21); // 21 Feb 2026
    expect(isOverdue(copies[1], now)).toBe(true);
    expect(isOverdue(copies[1], new Date(2026, 1, 20))).toBe(false); // due today is not overdue
    expect(isOverdue(copies[2], now)).toBe(false);
    expect(isOverdue(copies[0], now)).toBe(false);
  });
});
