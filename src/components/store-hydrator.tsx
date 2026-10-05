'use client';

import { useLayoutEffect } from 'react';
import { useLibraryStore } from '@/store/library-store';
import { usePreferencesStore } from '@/store/preferences-store';

/** Reads device preferences once on the client, keeps <html lang> in sync, and loads the user's data. */
export function StoreHydrator() {
  const locale = usePreferencesStore((s) => s.locale);

  useLayoutEffect(() => {
    void usePreferencesStore.persist.rehydrate();
    void useLibraryStore.getState().load();
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
