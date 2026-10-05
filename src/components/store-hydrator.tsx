'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';
import { useLibraryStore } from '@/store/library-store';
import { usePreferencesStore } from '@/store/preferences-store';

/** Rehydrates persisted stores once on the client and keeps <html lang> in sync. */
export function StoreHydrator() {
  const locale = usePreferencesStore((s) => s.locale);

  useLayoutEffect(() => {
    void usePreferencesStore.persist.rehydrate();
    void useLibraryStore.persist.rehydrate();
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}

const subscribe = (onChange: () => void) => useLibraryStore.persist.onFinishHydration(onChange);

/** False on the server and until localStorage has been read; gate store-derived UI on it. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => useLibraryStore.persist.hasHydrated(),
    () => false,
  );
}
