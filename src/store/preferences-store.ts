import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Locale = 'en' | 'ms';
export type LibraryView = 'grid' | 'table';

interface PreferencesState {
  locale: Locale;
  libraryView: LibraryView;
  setLocale: (locale: Locale) => void;
  setLibraryView: (view: LibraryView) => void;
}

// Device-level UI preferences only. User identity, books and collections live on the server.
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: 'en',
      libraryView: 'grid',
      setLocale: (locale) => set({ locale }),
      setLibraryView: (libraryView) => set({ libraryView }),
    }),
    {
      name: 'lib-ax:preferences',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
