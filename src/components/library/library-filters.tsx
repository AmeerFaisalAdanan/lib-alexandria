'use client';

import { useState } from 'react';
import { LayoutGrid, List, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { OptionSelect, type Option } from '@/components/option-select';
import { useT, type Dictionary } from '@/i18n';
import { countActiveFilters, DEFAULT_FILTERS, SORT_KEYS, type LibraryFilters } from '@/lib/library';
import { cn } from '@/lib/utils';
import { usePreferencesStore } from '@/store/preferences-store';
import { BOOK_LANGUAGES, OWNERS, READING_STATUSES, type Category } from '@/types/library';

type Patch = (patch: Partial<LibraryFilters>) => void;

function options(t: Dictionary, categories: Category[]) {
  return {
    status: [{ value: 'all', label: t.library.allStatuses }, ...READING_STATUSES.map((s) => ({ value: s, label: t.status[s] }))] as Option<
      LibraryFilters['status']
    >[],
    category: [{ value: 'all', label: t.library.allCategories }, ...categories.map((c) => ({ value: c.name, label: c.name }))],
    language: [
      { value: 'all', label: t.library.allLanguages },
      ...BOOK_LANGUAGES.map((l) => ({ value: l, label: t.bookLanguage[l] })),
    ] as Option<LibraryFilters['language']>[],
    owner: [{ value: 'all', label: t.library.allOwners }, ...OWNERS.map((o) => ({ value: o, label: o }))] as Option<
      LibraryFilters['owner']
    >[],
    sort: SORT_KEYS.map((k) => ({ value: k, label: t.library.sort[k] })),
  };
}

function StatusSegments({ value, onChange, className }: { value: LibraryFilters['status']; onChange: (v: LibraryFilters['status']) => void; className?: string }) {
  const { t } = useT();
  const items = ['all', ...READING_STATUSES] as const;
  return (
    <div role="group" aria-label={t.library.status} className={cn('flex max-w-full overflow-x-auto rounded-xl border border-border bg-card p-1', className)}>
      {items.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={value === s}
          onClick={() => onChange(s)}
          className={cn(
            'min-h-9 shrink-0 grow rounded-lg px-3 text-xs font-medium whitespace-nowrap transition md:grow-0',
            value === s ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {s === 'all' ? t.library.allStatuses : t.status[s]}
        </button>
      ))}
    </div>
  );
}

function FilterFields({ filters, patch, categories }: { filters: LibraryFilters; patch: Patch; categories: Category[] }) {
  const { t } = useT();
  const o = options(t, categories);
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">{t.library.status}</p>
        <div className="grid grid-cols-2 gap-2">
          {o.status.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={filters.status === s.value}
              onClick={() => patch({ status: s.value })}
              className={cn(
                'min-h-11 rounded-xl border px-3 text-sm font-semibold',
                filters.status === s.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {(
        [
          ['category', t.library.category, o.category],
          ['language', t.library.language, o.language],
          ['owner', t.library.owner, o.owner],
          ['sort', t.library.sortBy, o.sort],
        ] as const
      ).map(([key, label, opts]) => (
        <div key={key} className="space-y-2">
          <label htmlFor={`sheet-${key}`} className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            {label}
          </label>
          <OptionSelect
            id={`sheet-${key}`}
            value={filters[key]}
            onValueChange={(v) => patch({ [key]: v } as Partial<LibraryFilters>)}
            options={opts as Option<string>[]}
          />
        </div>
      ))}
    </div>
  );
}

interface LibraryToolbarProps {
  filters: LibraryFilters;
  onChange: Patch;
  onReset: () => void;
  categories: Category[];
  resultCount: (draft: LibraryFilters) => number;
}

export function LibraryToolbar({ filters, onChange, onReset, categories, resultCount }: LibraryToolbarProps) {
  const { t } = useT();
  const view = usePreferencesStore((s) => s.libraryView);
  const setView = usePreferencesStore((s) => s.setLibraryView);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const active = countActiveFilters(filters);
  const o = options(t, categories);
  const dirty = active > 0 || filters.q !== '' || filters.sort !== DEFAULT_FILTERS.sort;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder={t.library.searchPlaceholder}
            aria-label={t.library.searchLabel}
            className="h-11 rounded-xl bg-card pl-10 text-base md:text-sm"
          />
        </div>

        {/* Mobile: bottom-sheet filters */}
        <Drawer
          open={sheetOpen}
          onOpenChange={(open) => {
            if (open) setDraft(filters);
            setSheetOpen(open);
          }}
        >
          <DrawerTrigger
            render={
              <Button variant="outline" className="relative h-11 rounded-xl px-3 text-accent-foreground md:hidden" />
            }
          >
            <SlidersHorizontal aria-hidden />
            {t.library.filters}
            {active > 0 && (
              <span className="ml-0.5 rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground tabular-nums">{active}</span>
            )}
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{t.library.filters}</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-2">
              <FilterFields filters={draft} patch={(p) => setDraft((d) => ({ ...d, ...p }))} categories={categories} />
            </div>
            <DrawerFooter className="safe-bottom flex-row gap-3">
              <Button
                variant="secondary"
                className="h-11 flex-1"
                onClick={() => setDraft({ ...DEFAULT_FILTERS, q: draft.q })}
              >
                {t.common.reset}
              </Button>
              <DrawerClose
                render={<Button className="h-11 flex-[2] font-bold" onClick={() => onChange(draft)} />}
              >
                {t.library.showResults(resultCount(draft))}
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Desktop: inline filters */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <StatusSegments value={filters.status} onChange={(status) => onChange({ status })} />
        <OptionSelect aria-label={t.library.category} className="w-44" value={filters.category} onValueChange={(category) => onChange({ category })} options={o.category} />
        <OptionSelect aria-label={t.library.language} className="w-40" value={filters.language} onValueChange={(language) => onChange({ language })} options={o.language} />
        <OptionSelect aria-label={t.library.owner} className="w-36" value={filters.owner} onValueChange={(owner) => onChange({ owner })} options={o.owner} />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {dirty && (
            <Button variant="ghost" className="text-accent-foreground" onClick={onReset}>
              <X aria-hidden />
              {t.library.resetFilters}
            </Button>
          )}
          <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">{t.library.sortBy}</span>
          <OptionSelect aria-label={t.library.sortBy} className="w-40" value={filters.sort} onValueChange={(sort) => onChange({ sort })} options={o.sort} />
          <div role="group" className="flex rounded-xl border border-border bg-card p-1">
            {(
              [
                ['grid', LayoutGrid, t.library.viewGrid],
                ['table', List, t.library.viewList],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-label={label}
                title={label}
                onClick={() => setView(v)}
                className={cn('rounded-lg p-1.5', view === v ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: quick status chips stay visible without opening the sheet */}
      <StatusSegments className="md:hidden" value={filters.status} onChange={(status) => onChange({ status })} />
    </div>
  );
}
