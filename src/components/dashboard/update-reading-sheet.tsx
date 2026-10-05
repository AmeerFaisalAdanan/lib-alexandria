'use client';

import Link from 'next/link';
import { BookMarked } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { ProgressControl } from '@/components/books/progress-control';
import { EmptyState } from '@/components/page';
import { useT } from '@/i18n';
import { currentlyReading } from '@/lib/library';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';

/** Dashboard quick action: update progress for every book in progress, without leaving the page. */
export function UpdateReadingSheet() {
  const { t } = useT();
  const books = useLibraryStore((s) => s.books);
  const reading = currentlyReading(books);

  return (
    <Drawer>
      <DrawerTrigger render={<Button variant="secondary" className="h-11 rounded-xl px-4 md:h-10" />}>
        <BookMarked aria-hidden />
        {t.dashboard.updateReading}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t.dashboard.updateReadingTitle}</DrawerTitle>
          <DrawerDescription>{t.dashboard.updateReadingDesc}</DrawerDescription>
        </DrawerHeader>
        <div className="safe-bottom mx-auto w-full max-w-2xl space-y-4 overflow-y-auto px-4 pb-6">
          {reading.length === 0 ? (
            <EmptyState
              icon="📖"
              title={t.dashboard.noReadingTitle}
              body={t.dashboard.noReadingBody}
              action={
                <Link href="/library?status=want_to_read" className={cn(buttonVariants(), 'h-11 px-5 font-bold')}>
                  {t.dashboard.browseLibrary}
                </Link>
              }
            />
          ) : (
            reading.map((book) => (
              <div key={book.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                <div className="min-w-0">
                  <p className="truncate font-bold">{book.title}</p>
                  <p className="truncate text-sm text-muted-foreground">{book.author}</p>
                </div>
                <ProgressControl book={book} compact />
              </div>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
