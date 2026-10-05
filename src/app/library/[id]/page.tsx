'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CategoryBadge, OwnerAvatar, StatusBadge } from '@/components/books/badges';
import { BookCollections } from '@/components/books/book-collections';
import { ProgressControl } from '@/components/books/progress-control';
import { RatingInput } from '@/components/books/rating-input';
import { TagEditor } from '@/components/books/tag-editor';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, PageContainer, PageSkeleton } from '@/components/page';
import { useHydrated } from '@/components/store-hydrator';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';
import { READING_STATUSES, type Book } from '@/types/library';

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3 rounded-2xl border border-border bg-card p-4 md:p-6', className)}>
      <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function NotesEditor({ book }: { book: Book }) {
  const { t } = useT();
  const updateNotes = useLibraryStore((s) => s.updateNotes);
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <div className="space-y-3">
        <p className={cn('text-sm whitespace-pre-line', book.notes ? 'text-foreground' : 'text-muted-foreground italic')}>
          {book.notes || t.book.noNotes}
        </p>
        <Button variant="secondary" className="h-11 md:h-9" onClick={() => setDraft(book.notes ?? '')}>
          <Pencil aria-hidden />
          {t.book.editNotes}
        </Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        updateNotes(book.id, draft);
        setDraft(null);
        toast.success(t.toast.notesSaved);
      }}
    >
      <Textarea
        autoFocus
        rows={5}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={t.book.notes}
        className="text-base md:text-sm"
      />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="h-11 md:h-9" onClick={() => setDraft(null)}>
          {t.common.cancel}
        </Button>
        <Button type="submit" className="h-11 font-bold md:h-9">
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}

function BookDetail({ book, onLeave }: { book: Book; onLeave: () => void }) {
  const { t, formatPrice, formatDate } = useT();
  const router = useRouter();
  const updateReadingStatus = useLibraryStore((s) => s.updateReadingStatus);
  const updateRating = useLibraryStore((s) => s.updateRating);
  const deleteBook = useLibraryStore((s) => s.deleteBook);

  const facts: [string, string | undefined][] = [
    [t.book.publisher, book.publisher],
    [t.book.year, book.publicationYear?.toString()],
    [t.book.isbn, book.isbn],
    [t.book.language, t.bookLanguage[book.language]],
    [t.book.purchaseDate, book.purchaseDate && formatDate(book.purchaseDate)],
    [t.book.price, book.price !== undefined ? formatPrice(book.price) : undefined],
  ];

  return (
    <PageContainer className="max-w-4xl">
      <Link href="/library" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-accent-foreground md:min-h-0">
        <ArrowLeft className="size-4" aria-hidden />
        {t.book.backToLibrary}
      </Link>

      <section className="space-y-5 rounded-3xl border border-border bg-card p-5 shadow-xl md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge category={book.category} />
              <StatusBadge status={book.status} progress={book.progress} />
            </div>
            <h1 className="text-2xl leading-tight font-extrabold tracking-tight break-words text-white md:text-4xl">{book.title}</h1>
            <p className="text-base text-muted-foreground">{book.author}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href={`/library/${book.id}/edit`} className={cn(buttonVariants({ variant: 'secondary' }), 'h-11 flex-1 md:h-9 md:flex-none')}>
              <Pencil aria-hidden />
              {t.common.edit}
            </Link>
            <ConfirmDialog
              trigger={
                <Button variant="destructive" className="h-11 flex-1 md:h-9 md:flex-none">
                  <Trash2 aria-hidden />
                  {t.common.delete}
                </Button>
              }
              title={t.book.deleteTitle}
              description={t.book.deleteBody(book.title)}
              confirmLabel={t.book.deleteConfirm}
              onConfirm={() => {
                onLeave();
                router.replace('/library');
                deleteBook(book.id);
                toast.success(t.toast.bookDeleted);
              }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/80 bg-background/60 p-4 text-sm">
          <div className="flex items-center gap-3">
            <OwnerAvatar owner={book.owner} />
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold text-muted-foreground uppercase">{t.book.owner}</span>
              <span className="font-semibold">{book.owner}</span>
            </div>
          </div>
          <div className="min-w-0">
            <span className="block text-[11px] font-semibold text-muted-foreground uppercase">{t.book.location}</span>
            <span className="block truncate font-semibold">{book.location}</span>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title={t.book.readingStatus} className="md:col-span-2">
          <div role="group" aria-label={t.book.readingStatus} className="grid grid-cols-3 gap-2">
            {READING_STATUSES.map((s) => (
              <Button
                key={s}
                type="button"
                aria-pressed={book.status === s}
                variant={book.status === s ? 'default' : 'secondary'}
                className="h-11 px-2 text-xs whitespace-normal sm:text-sm md:h-10"
                onClick={() => {
                  if (s === book.status) return;
                  updateReadingStatus(book.id, s);
                  toast.success(s === 'completed' ? t.toast.bookCompleted : t.toast.statusUpdated);
                }}
              >
                {t.status[s]}
              </Button>
            ))}
          </div>
          <div className="pt-2">
            <ProgressControl book={book} />
          </div>
        </Section>

        <Section title={t.book.rating}>
          <RatingInput value={book.rating} onChange={(r) => updateRating(book.id, r)} />
          {!book.rating && <p className="text-xs text-muted-foreground">{t.book.notRated}</p>}
        </Section>

        <Section title={t.book.details}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {facts
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] font-semibold text-muted-foreground uppercase">{label}</dt>
                  <dd className="truncate font-medium">{value}</dd>
                </div>
              ))}
          </dl>
        </Section>

        <Section title={t.book.collections}>
          <BookCollections book={book} />
        </Section>

        <Section title={t.book.tags}>
          <TagEditor book={book} />
        </Section>

        <Section title={t.book.notes} className="md:col-span-2">
          <NotesEditor book={book} />
        </Section>
      </div>
    </PageContainer>
  );
}

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const hydrated = useHydrated();
  const book = useLibraryStore((s) => s.books.find((b) => b.id === id));
  const { t } = useT();
  // After a delete the book vanishes before navigation completes; avoid flashing "not found".
  const [leaving, setLeaving] = useState(false);

  if (!hydrated || (leaving && !book)) return <PageSkeleton />;
  if (!book) {
    return (
      <PageContainer className="max-w-xl">
        <EmptyState
          icon="📕"
          title={t.book.notFoundTitle}
          body={t.book.notFoundBody}
          action={
            <Link href="/library" className={cn(buttonVariants(), 'h-11 px-5 font-bold')}>
              {t.book.backToLibrary}
            </Link>
          }
        />
      </PageContainer>
    );
  }
  return <BookDetail book={book} onLeave={() => setLeaving(true)} />;
}
