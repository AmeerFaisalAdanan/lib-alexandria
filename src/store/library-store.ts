import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SEED_BOOKS } from '@/data/books';
import { SEED_CATEGORIES } from '@/data/categories';
import { SEED_COLLECTIONS } from '@/data/collections';
import { applyProgress, applyStatus, normaliseTag, reconcileStatus } from '@/lib/library';
import type { Book, Category, Collection, ReadingStatus } from '@/types/library';

export type NewBook = Omit<Book, 'id' | 'addedAt'>;
export type NewCollection = Omit<Collection, 'id'>;

interface LibraryState {
  books: Book[];
  collections: Collection[];
  categories: Category[];

  addBook: (book: NewBook) => string;
  updateBook: (id: string, patch: Partial<NewBook>) => void;
  deleteBook: (id: string) => void;
  updateReadingStatus: (id: string, status: ReadingStatus) => void;
  updateProgress: (id: string, progress: number) => void;
  updateRating: (id: string, rating: number | undefined) => void;
  updateNotes: (id: string, notes: string) => void;
  addTag: (id: string, tag: string) => void;
  removeTag: (id: string, tag: string) => void;

  addCollection: (collection: NewCollection) => string;
  updateCollection: (id: string, patch: Partial<NewCollection>) => void;
  deleteCollection: (id: string) => void;
  addBookToCollection: (bookId: string, collectionId: string) => void;
  removeBookFromCollection: (bookId: string, collectionId: string) => void;

  resetDemoData: () => void;
}

// Not crypto.randomUUID(): it's undefined on plain-HTTP LAN origins (e.g. testing on a phone).
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const seed = () => ({
  books: structuredClone(SEED_BOOKS),
  collections: structuredClone(SEED_COLLECTIONS),
  categories: structuredClone(SEED_CATEGORIES),
});

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => {
      const mapBook = (id: string, fn: (book: Book) => Book) =>
        set((state) => ({ books: state.books.map((b) => (b.id === id ? fn(b) : b)) }));

      return {
        ...seed(),

        addBook: (input) => {
          const id = newId('book');
          const book = reconcileStatus({ ...input, id, addedAt: new Date().toISOString() });
          set((state) => ({ books: [book, ...state.books] }));
          return id;
        },

        updateBook: (id, patch) => mapBook(id, (b) => reconcileStatus({ ...b, ...patch })),

        deleteBook: (id) => set((state) => ({ books: state.books.filter((b) => b.id !== id) })),

        updateReadingStatus: (id, status) => mapBook(id, (b) => applyStatus(b, status)),
        updateProgress: (id, progress) => mapBook(id, (b) => applyProgress(b, progress)),
        updateRating: (id, rating) => mapBook(id, (b) => ({ ...b, rating })),
        updateNotes: (id, notes) => mapBook(id, (b) => ({ ...b, notes: notes.trim() || undefined })),

        addTag: (id, tag) =>
          mapBook(id, (b) => {
            const clean = normaliseTag(tag);
            if (!clean || b.tags.some((t) => t.toLowerCase() === clean.toLowerCase())) return b;
            return { ...b, tags: [...b.tags, clean] };
          }),
        removeTag: (id, tag) => mapBook(id, (b) => ({ ...b, tags: b.tags.filter((t) => t !== tag) })),

        addCollection: (input) => {
          const id = newId('col');
          set((state) => ({ collections: [...state.collections, { ...input, id }] }));
          return id;
        },
        updateCollection: (id, patch) =>
          set((state) => ({ collections: state.collections.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
        deleteCollection: (id) =>
          set((state) => ({
            collections: state.collections.filter((c) => c.id !== id),
            books: state.books.map((b) =>
              b.collectionIds.includes(id) ? { ...b, collectionIds: b.collectionIds.filter((c) => c !== id) } : b,
            ),
          })),
        addBookToCollection: (bookId, collectionId) =>
          mapBook(bookId, (b) =>
            b.collectionIds.includes(collectionId) ? b : { ...b, collectionIds: [...b.collectionIds, collectionId] },
          ),
        removeBookFromCollection: (bookId, collectionId) =>
          mapBook(bookId, (b) => ({ ...b, collectionIds: b.collectionIds.filter((c) => c !== collectionId) })),

        resetDemoData: () => set(seed()),
      };
    },
    {
      name: 'lib-ax:library',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ books, collections, categories }) => ({ books, collections, categories }),
      // Rehydrated after mount by <StoreHydrator /> so server and first client render match.
      skipHydration: true,
    },
  ),
);
