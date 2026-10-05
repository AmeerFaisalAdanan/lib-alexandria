'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { BookForm } from '@/components/books/book-form';
import { EmptyState, PageContainer, PageHeader, PageSkeleton } from '@/components/page';
import { useHydrated } from '@/components/store-hydrator';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';

export default function EditBookPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const book = useLibraryStore((s) => s.books.find((b) => b.id === id));
  const updateBook = useLibraryStore((s) => s.updateBook);

  if (!hydrated) return <PageSkeleton />;
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

  const detailHref = `/library/${book.id}`;
  return (
    <PageContainer className="max-w-2xl">
      <Link href={detailHref} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-accent-foreground md:min-h-0">
        <ArrowLeft className="size-4" aria-hidden />
        {t.common.back}
      </Link>
      <PageHeader title={t.form.editTitle} description={t.form.editSubtitle} />
      <BookForm
        key={book.id}
        book={book}
        submitLabel={t.form.submitEdit}
        onCancel={() => router.push(detailHref)}
        onSubmit={(patch) => {
          updateBook(book.id, patch);
          toast.success(t.toast.bookUpdated);
          router.push(detailHref);
        }}
      />
    </PageContainer>
  );
}
