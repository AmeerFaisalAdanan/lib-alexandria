'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';

/** Loads an admin resource, with a way to reload it. The server decides who may see it; this only fetches. */
export function useAdminResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({ data: null, error: null, loading: true });

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await load();
      setState({ data, error: null, loading: false });
    } catch (e) {
      setState((s) => ({ data: s.data, error: e instanceof ApiError ? e : new ApiError(0, 'unknown', String(e)), loading: false }));
    }
  }, [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload, setData: (data: T) => setState((s) => ({ ...s, data })) };
}
