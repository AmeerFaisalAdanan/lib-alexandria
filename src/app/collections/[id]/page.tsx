'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MoreVertical, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { OwnerBadge, StatusBadge } from '@/components/books/badges';
import { CollectionDialog } from '@/components/collections/collection-dialog';
import { collectionDot } from '@/components/collections/collection-color';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, PageContainer, PageSkeleton } from '@/components/page';
import { useHydrated } from '@/components/store-hydrator';
import { useT } from '@/i18n';
import { DEFAULT_FILTERS, filterAndSortBooks } from '@/lib/library';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';
import type { Book, Collection } from '@/types/library';

function AddBooksSheet({ collection, candidates }: { collection: Collection; candidates: Book[] }) {
  const { t } = useT();
  const addBookToCollection = useLibraryStore((s) => s.addBookToCollection);
  const [q, setQ] = useState('');
  const matches = filterAndSortBooks(candidates, { ...DEFAULT_FILTERS, q, sort: 'title' });

  return (
    <Drawer onOpenChange={(open) => open && setQ('')}>
      <DrawerTrigger render={<Button className="h-11 rounded-xl px-4 font-bold md:h-10" />}>
        <Plus aria-hidden />
        {t.collections.addBooks}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t.collections.addBooksTitle}</DrawerTitle>
        </DrawerHeader>
        <div className="safe-bottom mx-auto flex w-full max-w-2xl min-h-0 flex-col gap-3 px-4 pb-6">
          {candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t.collections.allBooksAdded}</p>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t.collections.searchBooks}
                  aria-label={t.collections.searchBooks}
                  className="h-11 pl-10 text-base md:text-sm"
                />
              </div>
              <ul className="min-h-0 space-y-1 overflow-y-auto">
                {matches.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-secondary/40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{b.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{b.author}</p>
                    </div>
                    <Button
                      variant="secondary"
                      className="h-11 shrink-0 md:h-9"
                      aria-label={t.collections.addBookTo(b.title)}
                      onClick={() => {
                        addBookToCollection(b.id, collection.id);
                        toast.success(t.toast.addedToCollection(collection.name), { id: `add-${collection.id}` });
                      }}
                    >
                      <Plus aria-hidden />
                    </Button>
                  </li>
                ))}
                {matches.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">{t.library.noResultsTitle}</li>}
              </ul>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function CollectionDetail({ collection, onLeave }: { collection: Collection; onLeave: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const books = useLibraryStore((s) => s.books);
  const updateCollection = useLibraryStore((s) => s.updateCollection);
  const deleteCollection = useLibraryStore((s) => s.deleteCollection);
  const removeBookFromCollection = useLibraryStore((s) => s.removeBookFromCollection);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);

  const members = books.filter((b) => b.collectionIds.includes(collection.id)).sort((a, b) => a.title.localeCompare(b.title));
  const candidates = books.filter((b) => !b.collectionIds.includes(collection.id));

  return (
    <PageContainer className="max-w-4xl">
      <Link href="/collections" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-accent-foreground md:min-h-0">
        <ArrowLeft className="size-4" aria-hidden />
        {t.collections.backToCollections}
      </Link>

      <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-5">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            <span aria-hidden className={cn('size-3 shrink-0 rounded-full', collectionDot[collection.color])} />
            <span className="truncate">{collection.name}</span>
          </h1>
          {collection.description && <p className="mt-1 text-sm text-muted-foreground">{collection.description}</p>}
          <p className="mt-1 text-xs font-semibold text-muted-foreground">{t.common.books(members.length)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AddBooksSheet collection={collection} candidates={candidates} />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="secondary" size="icon" className="size-11 md:size-10" aria-label={t.collections.actions} />}>
              <MoreVertical aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem className="min-h-10" onClick={() => setDialog('rename')}>
                <Pencil aria-hidden />
                {t.common.rename}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setDialog('delete')}>
                <Trash2 aria-hidden />
                {t.common.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Dialogs live outside the menu so closing them never leaves the menu open. */}
          <CollectionDialog
            collection={collection}
            open={dialog === 'rename'}
            onOpenChange={(open) => setDialog(open ? 'rename' : null)}
            onSave={(values) => {
              updateCollection(collection.id, values);
              toast.success(t.toast.collectionRenamed);
            }}
          />
          <ConfirmDialog
            open={dialog === 'delete'}
            onOpenChange={(open) => setDialog(open ? 'delete' : null)}
            title={t.collections.deleteTitle}
            description={t.collections.deleteBody}
            confirmLabel={t.collections.deleteConfirm}
            onConfirm={() => {
              onLeave();
              router.replace('/collections');
              deleteCollection(collection.id);
              toast.success(t.toast.collectionDeleted);
            }}
          />
        </div>
      </div>

      {members.length === 0 ? (
        <EmptyState icon="🔖" title={t.collections.emptyCollectionTitle} body={t.collections.emptyCollectionBody} />
      ) : (
        <ul className="space-y-2">
          {members.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2 pl-4">
              <Link href={`/library/${b.id}`} className="min-w-0 flex-1 py-2">
                <p className="truncate font-bold hover:text-accent-foreground">{b.title}</p>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{b.author}</span>
                  <OwnerBadge owner={b.owner} />
                  <StatusBadge status={b.status} progress={b.progress} />
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 text-muted-foreground"
                aria-label={t.collections.removeBook(b.title)}
                onClick={() => {
                  removeBookFromCollection(b.id, collection.id);
                  toast(t.toast.removedFromCollection(collection.name));
                }}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const hydrated = useHydrated();
  const collection = useLibraryStore((s) => s.collections.find((c) => c.id === id));
  const [leaving, setLeaving] = useState(false);

  if (!hydrated || (leaving && !collection)) return <PageSkeleton />;
  if (!collection) {
    return (
      <PageContainer className="max-w-xl">
        <EmptyState
          icon="🔖"
          title={t.collections.notFoundTitle}
          body={t.collections.notFoundBody}
          action={
            <Link href="/collections" className={cn(buttonVariants(), 'h-11 px-5 font-bold')}>
              {t.collections.backToCollections}
            </Link>
          }
        />
      </PageContainer>
    );
  }
  return <CollectionDetail collection={collection} onLeave={() => setLeaving(true)} />;
}
