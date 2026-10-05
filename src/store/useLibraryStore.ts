import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Book, Collection, Category, ReadingStatus, Language } from '../types/library';
import { INITIAL_BOOKS, INITIAL_COLLECTIONS, INITIAL_CATEGORIES } from '../data/seed';

interface LibraryState {
  books: Book[];
  collections: Collection[];
  categories: Category[];
  language: Language;
  toastMessage: string | null;

  // Book mutations
  addBook: (book: Omit<Book, 'id' | 'addedAt'>) => void;
  updateBook: (id: string, updates: Partial<Book>) => void;
  deleteBook: (id: string) => void;
  updateReadingStatus: (id: string, status: ReadingStatus) => void;
  updateProgress: (id: string, progress: number) => void;
  updateRating: (id: string, rating: number) => void;
  updateNotes: (id: string, notes: string) => void;

  // Collection mutations
  addCollection: (col: Omit<Collection, 'id'>) => void;
  updateCollection: (id: string, updates: Partial<Collection>) => void;
  deleteCollection: (id: string) => void;
  addBookToCollection: (bookId: string, collectionId: string) => void;
  removeBookFromCollection: (bookId: string) => void;

  // Language & Feedback
  setLanguage: (lang: Language) => void;
  setToastMessage: (msg: string | null) => void;
  resetDemoData: () => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      books: INITIAL_BOOKS,
      collections: INITIAL_COLLECTIONS,
      categories: INITIAL_CATEGORIES,
      language: 'en',
      toastMessage: null,

      addBook: (bookData) => {
        const newBook: Book = {
          ...bookData,
          id: `book-${Date.now()}`,
          addedAt: new Date().toISOString(),
        };
        set((state) => ({
          books: [newBook, ...state.books],
          toastMessage: state.language === 'ms' ? 'Buku berjaya ditambah!' : 'Book added to library!',
        }));
      },

      updateBook: (id, updates) => {
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, ...updates } : b)),
          toastMessage: state.language === 'ms' ? 'Buku dikemaskini!' : 'Book updated!',
        }));
      },

      deleteBook: (id) => {
        set((state) => ({
          books: state.books.filter((b) => b.id !== id),
          toastMessage: state.language === 'ms' ? 'Buku dipadam.' : 'Book deleted.',
        }));
      },

      updateReadingStatus: (id, status) => {
        set((state) => ({
          books: state.books.map((b) => {
            if (b.id !== id) return b;
            let progress = b.progress;
            if (status === 'completed') progress = 100;
            if (status === 'want_to_read' && progress === 100) progress = 0;
            return { ...b, status, progress };
          }),
          toastMessage: state.language === 'ms' ? 'Status bacaan dikemaskini!' : 'Reading status updated!',
        }));
      },

      updateProgress: (id, progress) => {
        const validatedProgress = Math.min(100, Math.max(0, progress));
        set((state) => ({
          books: state.books.map((b) => {
            if (b.id !== id) return b;
            let status = b.status;
            if (validatedProgress === 100) status = 'completed';
            else if (validatedProgress > 0 && status === 'want_to_read') status = 'reading';
            return { ...b, progress: validatedProgress, status };
          }),
          toastMessage: state.language === 'ms' ? 'Kemajuan dikemaskini!' : 'Progress updated!',
        }));
      },

      updateRating: (id, rating) => {
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, rating } : b)),
          toastMessage: state.language === 'ms' ? 'Penarafan dikemaskini!' : 'Rating updated!',
        }));
      },

      updateNotes: (id, notes) => {
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, notes } : b)),
          toastMessage: state.language === 'ms' ? 'Nota dikemaskini!' : 'Notes updated!',
        }));
      },

      addCollection: (colData) => {
        const newCol: Collection = {
          ...colData,
          id: `col-${Date.now()}`,
        };
        set((state) => ({
          collections: [...state.collections, newCol],
          toastMessage: state.language === 'ms' ? 'Koleksi dicipta!' : 'Collection created!',
        }));
      },

      updateCollection: (id, updates) => {
        set((state) => ({
          collections: state.collections.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        }));
      },

      deleteCollection: (id) => {
        set((state) => ({
          collections: state.collections.filter((c) => c.id !== id),
          books: state.books.map((b) => (b.collectionId === id ? { ...b, collectionId: undefined } : b)),
        }));
      },

      addBookToCollection: (bookId, collectionId) => {
        set((state) => ({
          books: state.books.map((b) => (b.id === bookId ? { ...b, collectionId } : b)),
        }));
      },

      removeBookFromCollection: (bookId) => {
        set((state) => ({
          books: state.books.map((b) => (b.id === bookId ? { ...b, collectionId: undefined } : b)),
        }));
      },

      setLanguage: (lang) => {
        set({ language: lang });
      },

      setToastMessage: (msg) => {
        set({ toastMessage: msg });
      },

      resetDemoData: () => {
        set({
          books: INITIAL_BOOKS,
          collections: INITIAL_COLLECTIONS,
          categories: INITIAL_CATEGORIES,
          toastMessage: 'Demo data restored.',
        });
      },
    }),
    {
      name: 'alexandria-library-storage',
    }
  )
);
