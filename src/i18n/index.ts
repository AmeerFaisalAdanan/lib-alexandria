'use client';

import { useMemo } from 'react';
import { usePreferencesStore, type Locale } from '@/store/preferences-store';
import { en, type Dictionary } from './en';
import { ms } from './ms';

export const dictionaries: Record<Locale, Dictionary> = { en, ms };

const intlLocale: Record<Locale, string> = { en: 'en-MY', ms: 'ms-MY' };

export function useT() {
  const locale = usePreferencesStore((s) => s.locale);
  return useMemo(() => {
    const currency = new Intl.NumberFormat(intlLocale[locale], { style: 'currency', currency: 'MYR' });
    const date = new Intl.DateTimeFormat(intlLocale[locale], { day: 'numeric', month: 'short', year: 'numeric' });
    return {
      locale,
      t: dictionaries[locale],
      formatPrice: (amount: number) => currency.format(amount),
      formatDate: (iso: string) => date.format(new Date(iso)),
    };
  }, [locale]);
}

export type { Dictionary };
