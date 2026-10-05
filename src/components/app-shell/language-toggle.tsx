'use client';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { usePreferencesStore, type Locale } from '@/store/preferences-store';

const LOCALES: { value: Locale; short: string; long: string }[] = [
  { value: 'en', short: 'EN', long: 'English' },
  { value: 'ms', short: 'BM', long: 'Bahasa Melayu' },
];

export function LanguageToggle({ size = 'sm', className }: { size?: 'sm' | 'lg'; className?: string }) {
  const { t, locale } = useT();
  const setLocale = usePreferencesStore((s) => s.setLocale);
  return (
    <div
      role="radiogroup"
      aria-label={t.nav.language}
      className={cn('flex rounded-lg border border-border bg-background p-1 font-bold', className)}
    >
      {LOCALES.map((l) => (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={locale === l.value}
          lang={l.value}
          onClick={() => setLocale(l.value)}
          className={cn(
            'rounded-md transition-colors',
            size === 'sm' ? 'min-h-9 min-w-9 px-2 text-xs' : 'min-h-11 flex-1 px-4 text-sm',
            locale === l.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {size === 'sm' ? l.short : l.long}
        </button>
      ))}
    </div>
  );
}
