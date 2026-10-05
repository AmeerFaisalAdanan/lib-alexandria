'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';

/**
 * Runs a store action, reporting failures as a toast. Resolves true on success (after calling onSuccess),
 * false on failure, so callers can keep a dialog or draft open when something went wrong.
 */
export function useAction() {
  const { t } = useT();
  return useCallback(
    async (action: () => Promise<unknown>, onSuccess?: () => void): Promise<boolean> => {
      try {
        await action();
      } catch (e) {
        toast.error(errorMessage(e, t), { id: 'action-error' });
        return false;
      }
      onSuccess?.();
      return true;
    },
    [t],
  );
}
