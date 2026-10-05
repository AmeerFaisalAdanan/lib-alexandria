'use client';

import { Suspense, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { BookCard } from '@/components/books/book-card';
import { LanguageBadge, StatusBadge } from '@/components/books/badges';
import { DataGate } from '@/components/data-gate';
import { LibraryToolbar } from '@/components/library/library-filters';
import { EmptyState, PageContainer, PageHeader, PageSkeleton } from '@/components/page';
import { useT } from '@/i18n';
import {
  DEFAULT_FILTERS,
  filterAndSortBooks,
  filtersFromSearchParams,
  distinct,
  filtersToSearchParams,
  type LibraryFilters,
} from '@/lib/library';
import { cn } from '@/lib/utils';
import { useLibraryBooks } from '@/store/library-store';
import { usePreferencesStore } from '@/store/preferences-store';
import type { LibraryBook } from '@/types/library';

function BookTable({ books }: { books: LibraryBook[] }) {
  const { t } = useT();
  const c = t.library.column;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="border-b border-border bg-background text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <tr>
            <th className="w-[34%] px-5 py-3">{c.title}</th>
            <th className="w-[22%] px-5 py-3">{c.author}</th>
            <th className="w-[18%] px-5 py-3">{c.category}</th>
            <th className="w-[12%] px-5 py-3">{c.language}</th>
            <th className="w-[16%] px-5 py-3">{c.status}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/80">
          {books.map((b) => (
            <tr key={b.id} className="transition hover:bg-secondary/40">
              <td className="truncate px-5 py-3.5 font-bold">
                <Link href={`/library/${encodeURIComponent(b.id)}`} className="hover:text-accent-foreground">
                  {b.title}
                </Link>
              </td>
              <td className="truncate px-5 py-3.5 text-muted-foreground">{b.author}</td>
              <td className="truncate px-5 py-3.5 text-muted-foreground">{b.category}</td>
              <td className="px-5 py-3.5">
                <LanguageBadge language={b.language} />
              </td>
              <td className="px-5 py-3.5">
                <StatusBadge status={b.status} progress={b.progress} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LibraryView() {
  const { t } = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const books = useLibraryBooks();
  const categories = useMemo(() => distinct(books.map((b) => b.category)), [books]);
  const languages = useMemo(() => distinct(books.map((b) => b.language)), [books]);
  const view = usePreferencesStore((s) => s.libraryView);

  const filters = useMemo(() => filtersFromSearchParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const results = useMemo(() => filterAndSortBooks(books, filters), [books, filters]);

  // Native history updates sync with useSearchParams without a route transition,
  // so results update on every keystroke and Back/Forward still restore filters.
  const setFilters = useCallback(
    (next: LibraryFilters, mode: 'push' | 'replace') => {
      const qs = filtersToSearchParams(next).toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (mode === 'push') window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
    },
    [pathname],
  );

  const addBookLink = (
    <Link href="/library/add" className={cn(buttonVariants(), 'h-11 rounded-xl px-4 font-bold md:h-10')}>
      <Plus aria-hidden />
      <span className="hidden sm:inline">{t.nav.addBook}</span>
      <span className="sr-only sm:hidden">{t.nav.addBook}</span>
    </Link>
  );

  return (
    <PageContainer>
      <PageHeader title={t.library.title} description={<span aria-live="polite">{t.library.found(results.length)}</span>} actions={addBookLink} />

      {books.length === 0 ? (
        <EmptyState
          icon="📚"
          title={t.library.emptyLibraryTitle}
          body={t.library.emptyLibraryBody}
          action={
            <Link href="/library/add" className={cn(buttonVariants(), 'h-11 rounded-xl px-5 font-bold')}>
              <Plus aria-hidden />
              {t.nav.addBook}
            </Link>
          }
        />
      ) : (
        <>
          <LibraryToolbar
            filters={filters}
            categories={categories}
            languages={languages}
            // Typing replaces history; discrete filter changes push so Back undoes them.
            onChange={(patch) => setFilters({ ...filters, ...patch }, 'q' in patch && Object.keys(patch).length === 1 ? 'replace' : 'push')}
            onReset={() => setFilters(DEFAULT_FILTERS, 'push')}
            resultCount={(draft) => filterAndSortBooks(books, draft).length}
          />
          {results.length === 0 ? (
            <EmptyState
              icon="🔍"
              title={t.library.noResultsTitle}
              body={t.library.noResultsBody}
              action={
                <Button variant="secondary" className="h-11" onClick={() => setFilters(DEFAULT_FILTERS, 'push')}>
                  {t.library.resetFilters}
                </Button>
              }
            />
          ) : view === 'table' ? (
            <>
              <div className="hidden md:block">
                <BookTable books={results} />
              </div>
              <BookGrid books={results} className="md:hidden" />
            </>
          ) : (
            <BookGrid books={results} />
          )}
        </>
      )}
    </PageContainer>
  );
}

function BookGrid({ books, className }: { books: LibraryBook[]; className?: string }) {
  return (
    <ul className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-5 xl:grid-cols-3', className)}>
      {books.map((b) => (
        <li key={b.id} className="flex min-w-0 *:flex-1">
          <BookCard book={b} />
        </li>
      ))}
    </ul>
  );
}

export default function LibraryPage() {
  return (
    <DataGate>
      <Suspense fallback={<PageSkeleton />}>
        <LibraryView />
      </Suspense>
    </DataGate>
  );
}
