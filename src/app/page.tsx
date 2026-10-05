'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, Clock, Library, Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CategoryBadge, StatusBadge } from '@/components/books/badges';
import { ProgressControl } from '@/components/books/progress-control';
import { DataGate } from '@/components/data-gate';
import { UpdateReadingSheet } from '@/components/dashboard/update-reading-sheet';
import { EmptyState, PageContainer, PageHeader } from '@/components/page';
import { useT } from '@/i18n';
import { currentlyReading, libraryStats, lendingView, recentlyAdded, spendOn } from '@/lib/library';
import { cn } from '@/lib/utils';
import { useLibraryBooks, useLibraryStore } from '@/store/library-store';
import type { ReadingStatus } from '@/types/library';

function StatCard({ label, children, footer, icon }: { label: string; children: React.ReactNode; footer?: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-lg md:p-5">
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="line-clamp-2 text-xs leading-tight font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-extrabold tracking-tight break-words text-white tabular-nums sm:text-2xl md:text-3xl">{children}</div>
      {footer && <div className="mt-2 text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}

const STATUS_STRIP: { status: ReadingStatus; icon: typeof Clock; tone: string }[] = [
  { status: 'want_to_read', icon: Clock, tone: 'text-info' },
  { status: 'reading', icon: BookOpen, tone: 'text-accent-foreground' },
  { status: 'completed', icon: CheckCircle2, tone: 'text-success' },
];

function Dashboard() {
  const { t, formatPrice, formatDate } = useT();
  const books = useLibraryBooks();
  const me = useLibraryStore((s) => s.me);
  const copies = useLibraryStore((s) => s.copies);
  const stats = libraryStats(books);
  const { spend, avgPrice } = spendOn(copies, me?.id ?? '');
  const borrowing = lendingView(copies, 'borrowed', me?.id ?? '');
  const lentOut = lendingView(copies, 'lent', me?.id ?? '');
  const overdue = [...borrowing, ...lentOut].filter((c) => c.loan?.dueAt && c.loan.dueAt < new Date().toISOString().slice(0, 10)).length;
  const reading = currentlyReading(books).slice(0, 4);
  const recent = recentlyAdded(books, 5);

  const addBookLink = (
    <Link href="/library/add" className={cn(buttonVariants(), 'h-11 rounded-xl px-4 font-bold shadow-md shadow-amber-500/20 md:h-10')}>
      <Plus aria-hidden />
      {t.dashboard.addBook}
    </Link>
  );

  return (
    <PageContainer className="space-y-8">
      <PageHeader title={t.dashboard.title} description={t.dashboard.subtitle} className="flex-col sm:flex-row" />

      {/* Quick actions */}
      <div className="-mt-3 flex flex-wrap gap-2">
        {addBookLink}
        <Link href="/library" className={cn(buttonVariants({ variant: 'secondary' }), 'h-11 rounded-xl px-4 md:h-10')}>
          <Library aria-hidden />
          {t.dashboard.browseLibrary}
        </Link>
        <UpdateReadingSheet />
      </div>

      {books.length === 0 ? (
        <EmptyState
          icon="📚"
          title={t.dashboard.emptyTitle}
          body={t.dashboard.emptyBody}
          action={
            <Link href="/library/add" className={cn(buttonVariants(), 'h-11 rounded-xl px-5 font-bold')}>
              <Plus aria-hidden />
              {t.dashboard.browseCatalogue}
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4">
            <StatCard label={t.dashboard.totalBooks} icon={<span aria-hidden>📚</span>} footer={t.dashboard.inLibrary}>
              {stats.total}
            </StatCard>
            <StatCard
              label={t.dashboard.inProgress}
              icon={<span aria-hidden>📖</span>}
              footer={
                stats.byStatus.reading > 0 ? (
                  <div className="space-y-1.5">
                    <Progress value={stats.avgProgress} aria-label={t.dashboard.avgProgress(stats.avgProgress)} />
                    <span>{t.dashboard.avgProgress(stats.avgProgress)}</span>
                  </div>
                ) : undefined
              }
            >
              <span className="text-accent-foreground">{stats.byStatus.reading}</span>
            </StatCard>
            <StatCard label={t.dashboard.finished} icon={<span aria-hidden>✅</span>} footer={t.dashboard.finishedShare(stats.finishedPct)}>
              <span className="text-success">{stats.byStatus.completed}</span>
            </StatCard>
            <StatCard
              label={t.dashboard.spend}
              icon={<span aria-hidden>💰</span>}
              footer={spend > 0 ? t.dashboard.avgPerBook(formatPrice(avgPrice)) : t.dashboard.noSpend}
            >
              {formatPrice(spend)}
            </StatCard>
          </div>

          {(borrowing.length > 0 || lentOut.length > 0) && (
            <Link href="/lending" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-border bg-card/60 p-4 transition hover:bg-secondary/40">
              <span className="text-sm font-semibold text-white">{t.dashboard.lendingTitle}</span>
              <span className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                {borrowing.length > 0 && <span>{t.dashboard.borrowingNow(borrowing.length)}</span>}
                {lentOut.length > 0 && <span>{t.dashboard.lentNow(lentOut.length)}</span>}
                {overdue > 0 && <span className="font-semibold text-destructive">{t.dashboard.overdueNow(overdue)}</span>}
              </span>
            </Link>
          )}

          {/* Reading status strip: each count links to the filtered library. */}
          <div className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-card/60">
            {STATUS_STRIP.map(({ status, icon: Icon, tone }) => (
              <Link key={status} href={`/library?status=${status}`} className="space-y-1 rounded-2xl p-3 text-center transition hover:bg-secondary/40 md:p-4">
                <span className="flex min-h-8 items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Icon className={cn('size-3.5 shrink-0', tone)} aria-hidden />
                  <span className="leading-tight">{t.status[status]}</span>
                </span>
                <span className={cn('block text-xl font-bold tabular-nums', tone)}>{stats.byStatus[status]}</span>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <section className="space-y-4 lg:col-span-2" aria-labelledby="reading-heading">
              <div className="flex items-center justify-between">
                <h2 id="reading-heading" className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
                  <BookOpen className="size-5 text-accent-foreground" aria-hidden />
                  {t.dashboard.currentlyReading}
                </h2>
                <Link href="/library?status=reading" className="flex min-h-11 items-center gap-1 text-xs font-semibold text-accent-foreground hover:underline md:min-h-0">
                  {t.common.viewAll}
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              </div>
              {reading.length === 0 ? (
                <EmptyState
                  icon="📖"
                  title={t.dashboard.noReadingTitle}
                  body={t.dashboard.noReadingBody}
                  action={
                    <Link href="/library?status=want_to_read" className={cn(buttonVariants({ variant: 'secondary' }), 'h-11 px-5')}>
                      {t.dashboard.browseLibrary}
                    </Link>
                  }
                />
              ) : (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {reading.map((book) => (
                    <li key={book.id} className="flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-md md:p-5">
                      <div className="min-w-0 space-y-2">
                        <CategoryBadge category={book.category} className="max-w-[70%]" />
                        <Link href={`/library/${encodeURIComponent(book.id)}`} className="group block">
                          <h3 className="line-clamp-2 leading-snug font-bold break-words group-hover:text-accent-foreground">{book.title}</h3>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">{book.author}</p>
                        </Link>
                      </div>
                      <div className="border-t border-border/80 pt-3">
                        <ProgressControl book={book} compact />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-4" aria-labelledby="recent-heading">
              <div className="flex items-center justify-between">
                <h2 id="recent-heading" className="text-lg font-bold tracking-tight text-white">
                  {t.dashboard.recentlyAdded}
                </h2>
                <Link href="/library" className="flex min-h-11 items-center text-xs font-semibold text-accent-foreground hover:underline md:min-h-0">
                  {t.common.viewAll}
                </Link>
              </div>
              <ul className="space-y-1 rounded-2xl border border-border bg-card p-2 shadow-lg">
                {recent.map((book) => (
                  <li key={book.id}>
                    <Link href={`/library/${encodeURIComponent(book.id)}`} className="block rounded-xl p-3 transition hover:bg-secondary/60">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{book.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{book.author}</p>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <StatusBadge status={book.status} progress={book.progress} />
                        <span className="shrink-0">{formatDate(book.addedAt)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </PageContainer>
  );
}

export default function DashboardPage() {
  return (
    <DataGate>
      <Dashboard />
    </DataGate>
  );
}
