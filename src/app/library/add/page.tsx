'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { BookForm } from '@/components/books/book-form';
import { PageContainer, PageHeader, PageSkeleton } from '@/components/page';
import { useHydrated } from '@/components/store-hydrator';
import { useT } from '@/i18n';
import { useLibraryStore } from '@/store/library-store';

export default function AddBookPage() {
  const { t } = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const addBook = useLibraryStore((s) => s.addBook);

  if (!hydrated) return <PageSkeleton />;

  return (
    <PageContainer className="max-w-2xl">
      <Link href="/library" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-accent-foreground md:min-h-0">
        <ArrowLeft className="size-4" aria-hidden />
        {t.book.backToLibrary}
      </Link>
      <PageHeader title={t.form.addTitle} description={t.form.addSubtitle} />
      <BookForm
        submitLabel={t.form.submitAdd}
        onCancel={() => router.back()}
        onSubmit={(book) => {
          const id = addBook(book);
          toast.success(t.toast.bookAdded, {
            action: { label: t.library.view, onClick: () => router.push(`/library/${id}`) },
          });
          router.push('/library');
        }}
      />
    </PageContainer>
  );
}
