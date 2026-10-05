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

// Kept separate from the library store so "Reset Demo Data" leaves preferences alone.
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
