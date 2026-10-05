import { useMemo } from 'react';
import { create } from 'zustand';
import { api, ApiError, type CollectionInput, type CopyInput, type NewBookInput } from '@/lib/api';
import { applyEntryPatch, type EntryPatch } from '@/lib/library';
import type { Book, Collection, Copy, LibraryBook, LibraryEntry, Me, Person, ReadingStatus } from '@/types/library';

type CollectionPatch = Partial<Omit<CollectionInput, 'description'>> & { description?: string | null };

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface LibraryState {
  status: LoadStatus;
  /** Why the last load failed (drives the unauthorized / network / generic error screens). */
  error: ApiError | null;
  me: Me | null;

  /** The shared catalogue. Loaded separately so a catalogue outage does not hide the user's own library. */
  catalogue: Book[];
  catalogueError: ApiError | null;

  library: LibraryEntry[];
  collections: Collection[];
  /** Every physical copy in the shared library, with its current loan. */
  copies: Copy[];
  /** Members, loaded on demand (to pick a borrower). */
  users: Person[];

  load: () => Promise<void>;
  refreshLibrary: () => Promise<void>;

  addToLibrary: (bookId: string, initial?: { status?: ReadingStatus }) => Promise<void>;
  removeFromLibrary: (bookId: string) => Promise<void>;
  updateEntry: (bookId: string, patch: EntryPatch) => Promise<void>;

  publishBook: (input: NewBookInput) => Promise<Book>;

  loadUsers: () => Promise<void>;
  createCopy: (bookId: string, input?: CopyInput) => Promise<void>;
  updateCopy: (id: string, patch: CopyInput) => Promise<void>;
  deleteCopy: (id: string) => Promise<void>;
  lendCopy: (id: string, opts?: { borrowerId?: string; dueAt?: string }) => Promise<void>;
  returnCopy: (id: string) => Promise<void>;

  createCollection: (input: CollectionInput) => Promise<Collection>;
  updateCollection: (id: string, patch: CollectionPatch) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  addBookToCollection: (bookId: string, collectionId: string) => Promise<void>;
  removeBookFromCollection: (bookId: string, collectionId: string) => Promise<void>;
}

const asApiError = (e: unknown) => (e instanceof ApiError ? e : new ApiError(0, 'unknown', String(e)));

let inflightLoad: Promise<void> | null = null;

// Updates to the same book are sent one at a time, in order, so a slow response can never overwrite a newer one.
const queues = new Map<string, Promise<unknown>>();
const pending = new Map<string, number>();

export const useLibraryStore = create<LibraryState>()((set, get) => {
  const replaceEntry = (entry: LibraryEntry) =>
    set((s) => ({ library: s.library.map((e) => (e.id === entry.id ? entry : e)) }));
  const replaceCopy = (c: Copy) => set((s) => ({ copies: s.copies.map((x) => (x.id === c.id ? c : x)) }));
  const replaceCollection = (c: Collection) =>
    set((s) => ({ collections: s.collections.map((x) => (x.id === c.id ? c : x)) }));

  return {
    status: 'idle',
    error: null,
    me: null,
    catalogue: [],
    catalogueError: null,
    library: [],
    collections: [],
    copies: [],
    users: [],

    load: () => {
      if (inflightLoad) return inflightLoad;
      if (get().status !== 'ready') set({ status: 'loading', error: null });
      inflightLoad = (async () => {
        try {
          const [me, library, collections, copies, catalogue] = await Promise.all([
            api.me(),
            api.listLibrary(),
            api.listCollections(),
            api.listCopies(),
            api.listBooks().then(
              (books) => ({ books, error: null as ApiError | null }),
              (e) => ({ books: null, error: asApiError(e) }),
            ),
          ]);
          // An expired session can surface on any call; treat it as fatal even if only the catalogue saw it.
          if (catalogue.error?.isUnauthorized) throw catalogue.error;
          set((s) => ({
            status: 'ready',
            error: null,
            me,
            library,
            collections,
            copies,
            catalogue: catalogue.books ?? s.catalogue,
            catalogueError: catalogue.error,
          }));
        } catch (e) {
          set({ status: 'error', error: asApiError(e) });
        } finally {
          inflightLoad = null;
        }
      })();
      return inflightLoad;
    },

    refreshLibrary: async () => {
      const [library, collections] = await Promise.all([api.listLibrary(), api.listCollections()]);
      set({ library, collections });
    },

    publishBook: async (input) => {
      const book = await api.createBook(input);
      set((s) => ({ catalogue: [book, ...s.catalogue.filter((b) => b.id !== book.id)] }));
      return book;
    },

    loadUsers: async () => {
      set({ users: await api.listUsers() });
    },

    createCopy: async (bookId, input) => {
      const copy = await api.createCopy(bookId, input);
      set((s) => ({ copies: [...s.copies, copy] }));
    },
    updateCopy: async (id, patch) => {
      replaceCopy(await api.updateCopy(id, patch));
    },
    deleteCopy: async (id) => {
      await api.deleteCopy(id);
      set((s) => ({ copies: s.copies.filter((c) => c.id !== id) }));
    },
    lendCopy: async (id, opts) => {
      replaceCopy(await api.lendCopy(id, opts));
    },
    returnCopy: async (id) => {
      replaceCopy(await api.returnCopy(id));
    },

    addToLibrary: async (bookId, initial) => {
      const entry = await api.addToLibrary(bookId, initial);
      set((s) => ({ library: [entry, ...s.library.filter((e) => e.id !== entry.id)] }));
    },

    removeFromLibrary: async (bookId) => {
      await api.removeFromLibrary(bookId);
      set((s) => ({
        library: s.library.filter((e) => e.id !== bookId),
        collections: s.collections.map((c) => ({ ...c, bookIds: c.bookIds.filter((id) => id !== bookId) })),
      }));
    },

    updateEntry: (bookId, patch) => {
      const current = get().library.find((e) => e.id === bookId);
      if (!current) return Promise.reject(new ApiError(404, 'not_found', 'not found'));

      // Show the change immediately; the server response (same rules) replaces it when it lands.
      replaceEntry(applyEntryPatch(current, patch));
      pending.set(bookId, (pending.get(bookId) ?? 0) + 1);

      const run = (queues.get(bookId) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        try {
          const saved = await api.updateEntry(bookId, patch);
          if ((pending.get(bookId) ?? 1) <= 1) replaceEntry(saved);
        } catch (e) {
          await get().refreshLibrary().catch(() => undefined); // roll the optimistic change back to server truth
          throw e;
        } finally {
          pending.set(bookId, (pending.get(bookId) ?? 1) - 1);
        }
      });
      queues.set(bookId, run);
      return run;
    },

    createCollection: async (input) => {
      const created = await api.createCollection(input);
      set((s) => ({ collections: [...s.collections, created] }));
      return created;
    },

    updateCollection: async (id, patch) => {
      replaceCollection(await api.updateCollection(id, patch));
    },

    deleteCollection: async (id) => {
      await api.deleteCollection(id);
      set((s) => ({ collections: s.collections.filter((c) => c.id !== id) }));
    },

    addBookToCollection: async (bookId, collectionId) => {
      replaceCollection(await api.addCollectionBook(collectionId, bookId));
    },

    removeBookFromCollection: async (bookId, collectionId) => {
      replaceCollection(await api.removeCollectionBook(collectionId, bookId));
    },
  };
});

/** The user's library with each book's collection ids filled in. */
export function useLibraryBooks(): LibraryBook[] {
  const library = useLibraryStore((s) => s.library);
  const collections = useLibraryStore((s) => s.collections);
  return useMemo(() => {
    const byBook = new Map<string, string[]>();
    for (const c of collections) {
      for (const id of c.bookIds) byBook.set(id, [...(byBook.get(id) ?? []), c.id]);
    }
    return library.map((e) => ({ ...e, collectionIds: byBook.get(e.id) ?? [] }));
  }, [library, collections]);
}
