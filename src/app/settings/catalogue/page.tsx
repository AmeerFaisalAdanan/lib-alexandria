'use client';

import { useMemo, useState } from 'react';
import { Eye, EyeOff, MoreVertical, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { CategoryBadge, LanguageBadge } from '@/components/books/badges';
import { AdminGate, AdminResource, BackToSettings } from '@/components/admin/admin-gate';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, PageContainer, PageHeader } from '@/components/page';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { searchCatalogue } from '@/lib/library';
import { useAction } from '@/lib/use-action';
import { useAdminResource } from '@/lib/use-admin';
import { cn } from '@/lib/utils';
import type { AdminBook } from '@/types/library';

const FILTERS = ['all', 'issues', 'hidden'] as const;
type Filter = (typeof FILTERS)[number];
const PAGE = 40;

function CatalogueAdmin() {
  const { t } = useT();
  const run = useAction();
  const { data, error, loading, reload, setData } = useAdminResource(api.admin.catalogue);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [visible, setVisible] = useState(PAGE);
  const [confirmHide, setConfirmHide] = useState<AdminBook | null>(null);

  const books = useMemo(() => data ?? [], [data]);
  const counts = useMemo(
    () => ({ all: books.length, issues: books.filter((b) => b.issues.length > 0).length, hidden: books.filter((b) => b.hidden).length }),
    [books],
  );
  const results = useMemo(() => {
    const searched = searchCatalogue(books, q) as AdminBook[];
    return searched.filter((b) => (filter === 'issues' ? b.issues.length > 0 : filter === 'hidden' ? b.hidden : true));
  }, [books, q, filter]);

  const setHidden = (book: AdminBook, hidden: boolean) =>
    run(
      async () => {
        await api.admin.setBookHidden(book.id, hidden);
        setData(books.map((b) => (b.id === book.id ? { ...b, hidden } : b)));
      },
      () => toast.success(hidden ? t.admin.toastHidden : t.admin.toastShown),
    );

  return (
    <PageContainer className="max-w-3xl">
      <BackToSettings />
      <PageHeader title={t.admin.catalogueTitle} description={t.admin.catalogueSubtitle} />

      <AdminResource loading={loading} error={error} hasData={!!data} onRetry={() => void reload()}>
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setVisible(PAGE);
              }}
              placeholder={t.admin.catalogueSearch}
              aria-label={t.admin.catalogueSearchLabel}
              className="h-11 rounded-xl bg-card pl-10 text-base md:text-sm"
            />
          </div>

          <div role="group" aria-label={t.admin.catalogueTitle} className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => {
                  setFilter(f);
                  setVisible(PAGE);
                }}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition md:text-sm',
                  filter === f ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="truncate">{f === 'all' ? t.admin.filterAll : f === 'issues' ? t.admin.filterIssues : t.admin.filterHidden}</span>
                <span className="tabular-nums opacity-80">{counts[f]}</span>
              </button>
            ))}
          </div>
          <p className="text-xs font-semibold text-muted-foreground" aria-live="polite">
            {t.admin.records(results.length)}
          </p>

          {results.length === 0 ? (
            <EmptyState icon="🔍" title={t.admin.catalogueNoMatches} />
          ) : (
            <ul className="space-y-3">
              {results.slice(0, visible).map((b) => (
                <li key={b.id} data-testid="catalogue-row" data-book={b.id} className={cn('flex min-w-0 items-start gap-2 rounded-2xl border border-border bg-card p-4', b.hidden && 'border-dashed opacity-80')}>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="min-w-0">
                      <p className="line-clamp-2 leading-snug font-bold break-words">{b.title}</p>
                      <p className="truncate text-sm text-muted-foreground">{b.author}</p>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <CategoryBadge category={b.category} className="max-w-full" />
                      <LanguageBadge language={b.language} />
                      {b.hidden && <span className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">{t.admin.hiddenBadge}</span>}
                      {b.issues.map((i) => (
                        <span key={i} className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                          {t.admin.issue[i]}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs break-words text-muted-foreground">
                      {t.admin.readers(b.readers)} · {t.admin.copiesCount(b.copies)}
                      {b.submittedBy && <> · {t.admin.submittedBy(b.submittedBy)}</>}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={`${t.admin.catalogue}: ${b.title}`} />}>
                      <MoreVertical aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-56">
                      {b.hidden ? (
                        <DropdownMenuItem className="min-h-11" onClick={() => void setHidden(b, false)}>
                          <Eye aria-hidden />
                          {t.admin.show}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem variant="destructive" className="min-h-11" onClick={() => setConfirmHide(b)}>
                          <EyeOff aria-hidden />
                          {t.admin.hide}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
          {results.length > visible && (
            <Button variant="secondary" className="h-11 w-full" onClick={() => setVisible((v) => v + PAGE)}>
              {t.admin.moreRecords} ({results.length - visible})
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{t.admin.catalogueDeferred}</p>
        </div>
      </AdminResource>

      <ConfirmDialog
        open={confirmHide !== null}
        onOpenChange={(open) => !open && setConfirmHide(null)}
        title={t.admin.hideTitle}
        description={confirmHide ? t.admin.hideBody(confirmHide.title) : ''}
        confirmLabel={t.admin.hideConfirm}
        onConfirm={() => {
          const book = confirmHide;
          setConfirmHide(null);
          if (book) void setHidden(book, true);
        }}
      />
    </PageContainer>
  );
}

export default function CatalogueAdminPage() {
  return (
    <AdminGate>
      <CatalogueAdmin />
    </AdminGate>
  );
}
