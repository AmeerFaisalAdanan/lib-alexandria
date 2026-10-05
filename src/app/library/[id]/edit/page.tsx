'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { CategoryBadge } from '@/components/books/badges';
import { MyBookForm } from '@/components/books/my-book-form';
import { DataGate } from '@/components/data-gate';
import { EmptyState, PageContainer, PageHeader } from '@/components/page';
import { useT } from '@/i18n';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { useLibraryBooks, useLibraryStore } from '@/store/library-store';

function EditBook() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const router = useRouter();
  const run = useAction();
  const book = useLibraryBooks().find((b) => b.id === id);
  const updateEntry = useLibraryStore((s) => s.updateEntry);

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

  const detailHref = `/library/${encodeURIComponent(book.id)}`;
  return (
    <PageContainer className="max-w-2xl">
      <Link href={detailHref} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-accent-foreground md:min-h-0">
        <ArrowLeft className="size-4" aria-hidden />
        {t.common.back}
      </Link>
      <PageHeader title={t.form.editTitle} description={t.form.editSubtitle} />

      {/* Catalogue facts are shared and read-only here. */}
      <div className="min-w-0 space-y-1 rounded-2xl border border-border bg-card p-4">
        <CategoryBadge category={book.category} className="max-w-full" />
        <p className="line-clamp-2 font-bold break-words">{book.title}</p>
        <p className="truncate text-sm text-muted-foreground">{book.author}</p>
      </div>

      <MyBookForm
        key={book.id}
        book={book}
        submitLabel={t.form.submitEdit}
        onCancel={() => router.push(detailHref)}
        onSubmit={async (patch) => {
          await run(
            () => updateEntry(book.id, patch),
            () => {
              toast.success(t.toast.bookUpdated);
              router.push(detailHref);
            },
          );
        }}
      />
    </PageContainer>
  );
}

export default function EditBookPage() {
  return (
    <DataGate>
      <EditBook />
    </DataGate>
  );
}
