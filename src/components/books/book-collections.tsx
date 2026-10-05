'use client';

import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { collectionDot } from '@/components/collections/collection-color';
import { useT } from '@/i18n';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';
import type { LibraryBook } from '@/types/library';

/** Shows which collections a book is in, with add/remove. */
export function BookCollections({ book }: { book: LibraryBook }) {
  const { t } = useT();
  const run = useAction();
  const collections = useLibraryStore((s) => s.collections);
  const addBookToCollection = useLibraryStore((s) => s.addBookToCollection);
  const removeBookFromCollection = useLibraryStore((s) => s.removeBookFromCollection);

  const member = collections.filter((c) => book.collectionIds.includes(c.id));
  const available = collections.filter((c) => !book.collectionIds.includes(c.id));

  return (
    <div className="space-y-3">
      {member.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.book.noCollections}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {member.map((c) => (
            <li key={c.id} className="flex items-center rounded-full border border-border bg-secondary text-xs font-medium">
              <Link href={`/collections/${c.id}`} className="flex min-h-10 items-center gap-2 pr-1 pl-3 hover:text-accent-foreground">
                <span aria-hidden className={cn('size-2 rounded-full', collectionDot[c.color])} />
                {c.name}
              </Link>
              <button
                type="button"
                aria-label={t.collections.removeBook(book.title)}
                onClick={() =>
                  void run(
                    () => removeBookFromCollection(book.id, c.id),
                    () => toast(t.toast.removedFromCollection(c.name)),
                  )
                }
                className="mr-0.5 flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="secondary" className="h-11 md:h-9" />}>
            <Plus aria-hidden />
            {t.book.addToCollection}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56">
            {available.map((c) => (
              <DropdownMenuItem
                key={c.id}
                className="min-h-10"
                onClick={() =>
                  void run(
                    () => addBookToCollection(book.id, c.id),
                    () => toast.success(t.toast.addedToCollection(c.name)),
                  )
                }
              >
                <span aria-hidden className={cn('size-2 rounded-full', collectionDot[c.color])} />
                {c.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
