'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Plus, PlusCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CategoryBadge, LanguageBadge } from '@/components/books/badges';
import { DataGate } from '@/components/data-gate';
import { OptionSelect } from '@/components/option-select';
import { EmptyState, PageContainer, PageHeader } from '@/components/page';
import { useT } from '@/i18n';
import { distinct, searchCatalogue } from '@/lib/library';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';

const PAGE = 40;

/** Browse the shared catalogue and add books to the signed-in user's library. */
function CatalogueBrowser() {
  const { t } = useT();
  const router = useRouter();
  const run = useAction();
  const catalogue = useLibraryStore((s) => s.catalogue);
  const catalogueError = useLibraryStore((s) => s.catalogueError);
  const library = useLibraryStore((s) => s.library);
  const addToLibrary = useLibraryStore((s) => s.addToLibrary);
  const load = useLibraryStore((s) => s.load);
  const canAddBooks = useLibraryStore((s) => s.me?.canAddBooks);

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [visible, setVisible] = useState(PAGE);
  const [adding, setAdding] = useState<string | null>(null);

  const owned = useMemo(() => new Set(library.map((e) => e.id)), [library]);
  const categories = useMemo(() => distinct(catalogue.map((b) => b.category)), [catalogue]);
  const results = useMemo(() => searchCatalogue(catalogue, q, category), [catalogue, q, category]);

  const add = async (id: string) => {
    setAdding(id);
    await run(
      () => addToLibrary(id),
      () =>
        toast.success(t.toast.bookAdded, {
          action: { label: t.library.view, onClick: () => router.push(`/library/${encodeURIComponent(id)}`) },
        }),
    );
    setAdding(null);
  };

  return (
    <PageContainer className="max-w-3xl">
      <Link href="/library" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-accent-foreground md:min-h-0">
        <ArrowLeft className="size-4" aria-hidden />
        {t.book.backToLibrary}
      </Link>
      <PageHeader title={t.catalogue.title} description={t.catalogue.subtitle} />

      {catalogueError ? (
        <EmptyState
          icon="🗂️"
          title={t.catalogue.unavailableTitle}
          body={t.catalogue.unavailableBody}
          action={
            <Button className="h-11 px-5 font-bold" onClick={() => void load()}>
              {t.catalogue.retry}
            </Button>
          }
        />
      ) : catalogue.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title={t.catalogue.emptyTitle}
          body={t.catalogue.emptyBody}
          action={
            canAddBooks ? (
              <Link href="/library/add/new" className={cn(buttonVariants(), 'h-11 px-5 font-bold')}>
                <PlusCircle aria-hidden />
                {t.catalogue.publishNoResults}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setVisible(PAGE);
                }}
                placeholder={t.catalogue.searchPlaceholder}
                aria-label={t.catalogue.searchLabel}
                className="h-11 rounded-xl bg-card pl-10 text-base md:text-sm"
              />
            </div>
            <OptionSelect
              aria-label={t.library.category}
              className="sm:w-48"
              value={category}
              onValueChange={(c) => {
                setCategory(c);
                setVisible(PAGE);
              }}
              options={[{ value: 'all', label: t.library.allCategories }, ...categories.map((c) => ({ value: c, label: c }))]}
            />
          </div>
          <p className="text-xs font-semibold text-muted-foreground" aria-live="polite">
            {t.catalogue.count(results.length)}
          </p>

          {results.length === 0 ? (
            <EmptyState
              icon="🔍"
              title={t.library.noResultsTitle}
              body={t.library.noResultsBody}
              action={
                canAddBooks ? (
                  <Link
                    href={`/library/add/new${q.trim() ? `?title=${encodeURIComponent(q.trim())}` : ''}`}
                    className={cn(buttonVariants(), 'h-11 px-5 font-bold')}
                  >
                    <PlusCircle aria-hidden />
                    {t.catalogue.publishNoResults}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-2">
              {results.slice(0, visible).map((b) => {
                const inLibrary = owned.has(b.id);
                return (
                  <li key={b.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 pl-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="line-clamp-2 leading-snug font-bold break-words">{b.title}</p>
                      <p className="truncate text-sm text-muted-foreground">{b.author}</p>
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-0.5">
                        <CategoryBadge category={b.category} className="max-w-full" />
                        <LanguageBadge language={b.language} />
                      </div>
                    </div>
                    {inLibrary ? (
                      <Link
                        href={`/library/${encodeURIComponent(b.id)}`}
                        className={cn(buttonVariants({ variant: 'secondary' }), 'h-11 shrink-0 gap-1.5 text-success md:h-9')}
                      >
                        <Check aria-hidden />
                        <span className="max-w-24 truncate">{t.catalogue.inLibrary}</span>
                      </Link>
                    ) : (
                      <Button
                        className="h-11 shrink-0 font-bold md:h-9"
                        disabled={adding === b.id}
                        aria-label={t.catalogue.addAria(b.title)}
                        onClick={() => void add(b.id)}
                      >
                        <Plus aria-hidden />
                        {t.catalogue.add}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {canAddBooks && results.length > 0 && (
            <Link href="/library/add/new" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full gap-2')}>
              <PlusCircle aria-hidden />
              {t.catalogue.publishLink}
            </Link>
          )}
          {results.length > visible && (
            <Button variant="secondary" className="h-11 w-full" onClick={() => setVisible((v) => v + PAGE)}>
              {t.common.viewAll} ({results.length - visible})
            </Button>
          )}
        </>
      )}
    </PageContainer>
  );
}

export default function AddBookPage() {
  return (
    <DataGate>
      <CatalogueBrowser />
    </DataGate>
  );
}
