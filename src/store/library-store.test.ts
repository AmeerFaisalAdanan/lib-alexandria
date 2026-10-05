import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { Collection, Copy, LibraryEntry, Me } from '@/types/library';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      me: vi.fn(), listBooks: vi.fn(), listLibrary: vi.fn(), listCollections: vi.fn(), listCopies: vi.fn(), listUsers: vi.fn(),
      createBook: vi.fn(), createCopy: vi.fn(), updateCopy: vi.fn(), deleteCopy: vi.fn(), lendCopy: vi.fn(), returnCopy: vi.fn(),
      addToLibrary: vi.fn(), updateEntry: vi.fn(), removeFromLibrary: vi.fn(),
      createCollection: vi.fn(), updateCollection: vi.fn(), deleteCollection: vi.fn(),
      addCollectionBook: vi.fn(), removeCollectionBook: vi.fn(),
    },
  };
});

import { api } from '@/lib/api';
import { useLibraryStore } from '@/store/library-store';

const m = vi.mocked(api, true);
const me: Me = { id: 'u1', email: 'ada@example.com', authMode: 'dev', canAddBooks: true, features: { isbnLookup: true, coverScan: true } };
const entry = (over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id: 'bk-1', title: 'T', author: 'A', language: 'English', category: 'C',
  status: 'want_to_read', progress: 0, notes: '', tags: [], addedAt: '2026-01-01T00:00:00Z', ...over,
});
const collection = (over: Partial<Collection> = {}): Collection => ({ id: 'c1', name: 'Shelf', color: 'amber', bookIds: [], ...over });

const reset = () =>
  useLibraryStore.setState({ status: 'idle', error: null, me: null, catalogue: [], catalogueError: null, library: [], collections: [], copies: [], users: [] });

beforeEach(() => {
  vi.resetAllMocks();
  m.listCopies.mockResolvedValue([]);
  reset();
});

describe('load', () => {
  it('loads identity, library, collections and catalogue', async () => {
    m.me.mockResolvedValue(me);
    m.listLibrary.mockResolvedValue([entry()]);
    m.listCollections.mockResolvedValue([collection()]);
    m.listBooks.mockResolvedValue([{ id: 'bk-1', title: 'T', author: 'A', language: 'English', category: 'C' }]);
    await useLibraryStore.getState().load();
    const s = useLibraryStore.getState();
    expect(s).toMatchObject({ status: 'ready', error: null, me });
    expect(s.library).toHaveLength(1);
    expect(s.catalogue).toHaveLength(1);
  });

  it('a catalogue outage does not hide the user’s own library', async () => {
    m.me.mockResolvedValue(me);
    m.listLibrary.mockResolvedValue([entry()]);
    m.listCollections.mockResolvedValue([]);
    m.listBooks.mockRejectedValue(new ApiError(503, 'catalogue_unavailable', 'down'));
    await useLibraryStore.getState().load();
    const s = useLibraryStore.getState();
    expect(s.status).toBe('ready');
    expect(s.library).toHaveLength(1);
    expect(s.catalogueError?.status).toBe(503);
  });

  it('an expired session is a load error, even if only the catalogue noticed', async () => {
    m.me.mockResolvedValue(me);
    m.listLibrary.mockResolvedValue([]);
    m.listCollections.mockResolvedValue([]);
    m.listBooks.mockRejectedValue(new ApiError(401, 'unauthorized', 'x'));
    await useLibraryStore.getState().load();
    expect(useLibraryStore.getState()).toMatchObject({ status: 'error' });
    expect(useLibraryStore.getState().error?.isUnauthorized).toBe(true);
  });

  it('network failure surfaces as an error state and can be retried', async () => {
    m.me.mockRejectedValueOnce(new ApiError(0, 'network', 'offline'));
    m.listLibrary.mockResolvedValue([]);
    m.listCollections.mockResolvedValue([]);
    m.listBooks.mockResolvedValue([]);
    await useLibraryStore.getState().load();
    expect(useLibraryStore.getState().error?.isNetwork).toBe(true);

    m.me.mockResolvedValue(me);
    await useLibraryStore.getState().load();
    expect(useLibraryStore.getState()).toMatchObject({ status: 'ready', error: null });
  });

  it('concurrent loads share one request', async () => {
    m.me.mockResolvedValue(me);
    m.listLibrary.mockResolvedValue([]);
    m.listCollections.mockResolvedValue([]);
    m.listBooks.mockResolvedValue([]);
    await Promise.all([useLibraryStore.getState().load(), useLibraryStore.getState().load()]);
    expect(m.me).toHaveBeenCalledTimes(1);
  });
});

describe('library mutations', () => {
  it('addToLibrary puts the saved entry first', async () => {
    useLibraryStore.setState({ library: [entry({ id: 'old' })] });
    m.addToLibrary.mockResolvedValue(entry({ id: 'new' }));
    await useLibraryStore.getState().addToLibrary('new');
    expect(useLibraryStore.getState().library.map((e) => e.id)).toEqual(['new', 'old']);
  });

  it('removeFromLibrary also drops the book from collections', async () => {
    useLibraryStore.setState({ library: [entry()], collections: [collection({ bookIds: ['bk-1', 'bk-2'] })] });
    m.removeFromLibrary.mockResolvedValue(undefined);
    await useLibraryStore.getState().removeFromLibrary('bk-1');
    const s = useLibraryStore.getState();
    expect(s.library).toEqual([]);
    expect(s.collections[0].bookIds).toEqual(['bk-2']);
  });

  it('updateEntry shows the change at once, then keeps the server’s version', async () => {
    useLibraryStore.setState({ library: [entry()] });
    let resolve!: (e: LibraryEntry) => void;
    m.updateEntry.mockReturnValue(new Promise((r) => (resolve = r)));

    const done = useLibraryStore.getState().updateEntry('bk-1', { progress: 40 });
    expect(useLibraryStore.getState().library[0]).toMatchObject({ status: 'reading', progress: 40 }); // optimistic

    resolve(entry({ status: 'reading', progress: 40, rating: 5 }));
    await done;
    expect(useLibraryStore.getState().library[0].rating).toBe(5); // server value replaced it
  });

  it('updateEntry rolls back to server truth on failure and rethrows', async () => {
    useLibraryStore.setState({ library: [entry()] });
    m.updateEntry.mockRejectedValue(new ApiError(500, 'internal', 'boom'));
    m.listLibrary.mockResolvedValue([entry()]);
    m.listCollections.mockResolvedValue([]);
    await expect(useLibraryStore.getState().updateEntry('bk-1', { status: 'completed' })).rejects.toMatchObject({ status: 500 });
    expect(useLibraryStore.getState().library[0]).toMatchObject({ status: 'want_to_read', progress: 0 });
  });

  it('updates to one book are sent in order, and a slow earlier reply cannot overwrite a later one', async () => {
    useLibraryStore.setState({ library: [entry({ status: 'reading', progress: 10 })] });
    const order: number[] = [];
    m.updateEntry.mockImplementation(async (_id, patch) => {
      order.push(patch.progress as number);
      await new Promise((r) => setTimeout(r, patch.progress === 30 ? 20 : 0));
      return entry({ status: 'reading', progress: patch.progress as number });
    });
    const s = useLibraryStore.getState();
    await Promise.all([s.updateEntry('bk-1', { progress: 30 }), s.updateEntry('bk-1', { progress: 60 })]);
    expect(order).toEqual([30, 60]);
    expect(useLibraryStore.getState().library[0].progress).toBe(60);
  });

  it('updateEntry on an unknown book is a 404', async () => {
    await expect(useLibraryStore.getState().updateEntry('nope', { progress: 1 })).rejects.toMatchObject({ status: 404 });
    expect(m.updateEntry).not.toHaveBeenCalled();
  });
});

describe('collections', () => {
  it('create, update, delete, membership', async () => {
    const st = useLibraryStore.getState;
    m.createCollection.mockResolvedValue(collection());
    await st().createCollection({ name: 'Shelf', color: 'amber' });
    expect(st().collections).toHaveLength(1);

    m.updateCollection.mockResolvedValue(collection({ name: 'Renamed' }));
    await st().updateCollection('c1', { name: 'Renamed' });
    expect(st().collections[0].name).toBe('Renamed');

    m.addCollectionBook.mockResolvedValue(collection({ name: 'Renamed', bookIds: ['bk-1'] }));
    await st().addBookToCollection('bk-1', 'c1');
    expect(st().collections[0].bookIds).toEqual(['bk-1']);

    m.removeCollectionBook.mockResolvedValue(collection({ name: 'Renamed' }));
    await st().removeBookFromCollection('bk-1', 'c1');
    expect(st().collections[0].bookIds).toEqual([]);

    m.deleteCollection.mockResolvedValue(undefined);
    await st().deleteCollection('c1');
    expect(st().collections).toEqual([]);
  });

  it('a failed collection change leaves state untouched', async () => {
    useLibraryStore.setState({ collections: [collection()] });
    m.updateCollection.mockRejectedValue(new ApiError(404, 'not_found', 'x'));
    await expect(useLibraryStore.getState().updateCollection('c1', { name: 'X' })).rejects.toBeInstanceOf(ApiError);
    expect(useLibraryStore.getState().collections[0].name).toBe('Shelf');
  });
});

const copy = (over: Partial<Copy> = {}): Copy => ({
  id: 'cp1',
  book: { id: 'bk-1', title: 'T', author: 'A', language: 'English', category: 'C' },
  owner: { id: 'u2', email: 'owner@example.com' },
  createdAt: '2026-01-01T00:00:00Z',
  loan: null,
  ...over,
});

describe('publishing a book', () => {
  it('adds the new book to the catalogue straight away', async () => {
    useLibraryStore.setState({ catalogue: [{ id: 'old', title: 'Old', author: 'A', language: 'English', category: 'C' }] });
    m.createBook.mockResolvedValue({ id: 'bk-new', title: 'New', author: 'B', language: 'English', category: 'C' });
    const book = await useLibraryStore.getState().publishBook({ title: 'New', author: 'B', language: 'English', category: 'C' });
    expect(book.id).toBe('bk-new');
    expect(useLibraryStore.getState().catalogue.map((b) => b.id)).toEqual(['bk-new', 'old']);
  });

  it('a rejected duplicate leaves the catalogue untouched and exposes the existing id', async () => {
    m.createBook.mockRejectedValue(new ApiError(409, 'duplicate', 'exists', undefined, 'bk-existing'));
    const err = await useLibraryStore.getState().publishBook({ title: 'x', author: 'y', language: 'English', category: 'C' }).catch((e) => e);
    expect(err).toMatchObject({ code: 'duplicate', existing: 'bk-existing' });
    expect(useLibraryStore.getState().catalogue).toEqual([]);
  });
});

describe('copies and lending', () => {
  it('load includes every copy in the shared library', async () => {
    m.me.mockResolvedValue(me);
    m.listLibrary.mockResolvedValue([]);
    m.listCollections.mockResolvedValue([]);
    m.listBooks.mockResolvedValue([]);
    m.listCopies.mockResolvedValue([copy()]);
    await useLibraryStore.getState().load();
    expect(useLibraryStore.getState().copies).toHaveLength(1);
  });

  it('create, update, lend, return and delete keep the list in step with the server', async () => {
    const st = useLibraryStore.getState;
    m.createCopy.mockResolvedValue(copy());
    await st().createCopy('bk-1', { location: 'Shelf' });
    expect(st().copies).toHaveLength(1);

    m.updateCopy.mockResolvedValue(copy({ location: 'Study' }));
    await st().updateCopy('cp1', { location: 'Study' });
    expect(st().copies[0].location).toBe('Study');

    const loan = { id: 'l1', borrower: { id: 'u1', email: 'ada@example.com' }, borrowedAt: '2026-02-01T00:00:00Z' };
    m.lendCopy.mockResolvedValue(copy({ location: 'Study', loan }));
    await st().lendCopy('cp1', { dueAt: '2026-03-01' });
    expect(m.lendCopy).toHaveBeenCalledWith('cp1', { dueAt: '2026-03-01' });
    expect(st().copies[0].loan?.borrower.id).toBe('u1');

    m.returnCopy.mockResolvedValue(copy({ location: 'Study' }));
    await st().returnCopy('cp1');
    expect(st().copies[0].loan).toBeNull();

    m.deleteCopy.mockResolvedValue(undefined);
    await st().deleteCopy('cp1');
    expect(st().copies).toEqual([]);
  });

  it('a refused loan (already on loan) leaves state as it was', async () => {
    useLibraryStore.setState({ copies: [copy()] });
    m.lendCopy.mockRejectedValue(new ApiError(409, 'on_loan', 'taken'));
    await expect(useLibraryStore.getState().lendCopy('cp1')).rejects.toMatchObject({ code: 'on_loan' });
    expect(useLibraryStore.getState().copies[0].loan).toBeNull();
  });

  it('loadUsers fills the member list', async () => {
    m.listUsers.mockResolvedValue([{ id: 'u2', email: 'owner@example.com' }]);
    await useLibraryStore.getState().loadUsers();
    expect(useLibraryStore.getState().users).toHaveLength(1);
  });
});
