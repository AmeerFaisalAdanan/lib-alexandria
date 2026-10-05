'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, Clock, Library, MapPin, Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CategoryBadge, OwnerAvatar, OwnerBadge } from '@/components/books/badges';
import { ProgressControl } from '@/components/books/progress-control';
import { UpdateReadingSheet } from '@/components/dashboard/update-reading-sheet';
import { EmptyState, PageContainer, PageHeader, PageSkeleton } from '@/components/page';
import { useHydrated } from '@/components/store-hydrator';
import { useT } from '@/i18n';
import { currentlyReading, libraryStats, recentlyAdded } from '@/lib/library';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';
import { OWNERS, type ReadingStatus } from '@/types/library';

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
  const books = useLibraryStore((s) => s.books);
  const stats = libraryStats(books);
  const reading = currentlyReading(books).slice(0, 4);
  const recent = recentlyAdded(books, 5);

  return (
    <PageContainer className="space-y-8">
      <PageHeader title={t.dashboard.title} description={t.dashboard.subtitle} className="flex-col sm:flex-row" />

      {/* Quick actions */}
      <div className="-mt-3 flex flex-wrap gap-2">
        <Link href="/library/add" className={cn(buttonVariants(), 'h-11 rounded-xl px-4 font-bold shadow-md shadow-amber-500/20 md:h-10')}>
          <Plus aria-hidden />
          {t.dashboard.addBook}
        </Link>
        <Link href="/library" className={cn(buttonVariants({ variant: 'secondary' }), 'h-11 rounded-xl px-4 md:h-10')}>
          <Library aria-hidden />
          {t.dashboard.browseLibrary}
        </Link>
        <UpdateReadingSheet />
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4">
        <StatCard label={t.dashboard.totalBooks} icon={<span aria-hidden>📚</span>} footer={t.dashboard.inLibrary}>
          {stats.total}
        </StatCard>
        <StatCard
          label={t.dashboard.collectionValue}
          icon={<span aria-hidden>💰</span>}
          footer={t.dashboard.avgPerBook(formatPrice(stats.avgPrice))}
        >
          <span className="text-success">{formatPrice(stats.value)}</span>
        </StatCard>
        {OWNERS.map((owner) => {
          const pct = stats.total ? Math.round((stats.byOwner[owner] / stats.total) * 100) : 0;
          return (
            <StatCard
              key={owner}
              label={owner}
              icon={<OwnerAvatar owner={owner} />}
              footer={
                <div className="space-y-1.5">
                  <Progress value={pct} aria-label={t.dashboard.ownerShare(pct)} className={owner === 'Taqim' ? '[&_[data-slot=progress-indicator]]:bg-success' : ''} />
                  <span>{t.dashboard.ownerShare(pct)}</span>
                </div>
              }
            >
              {stats.byOwner[owner]} <span className="text-xs font-normal text-muted-foreground">{t.common.bookUnit(stats.byOwner[owner])}</span>
            </StatCard>
          );
        })}
      </div>

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
                    <div className="flex items-start justify-between gap-2">
                      <CategoryBadge category={book.category} className="max-w-[70%]" />
                      <OwnerBadge owner={book.owner} />
                    </div>
                    <Link href={`/library/${book.id}`} className="group block">
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
                <Link href={`/library/${book.id}`} className="block rounded-xl p-3 transition hover:bg-secondary/60">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{book.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{book.author}</p>
                    </div>
                    <OwnerBadge owner={book.owner} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1">
                      <MapPin className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{book.location}</span>
                    </span>
                    <span className="shrink-0">{formatDate(book.addedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageContainer>
  );
}

export default function DashboardPage() {
  const hydrated = useHydrated();
  return hydrated ? <Dashboard /> : <PageSkeleton />;
}
