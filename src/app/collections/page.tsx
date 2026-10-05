'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CollectionDialog } from '@/components/collections/collection-dialog';
import { collectionAccent } from '@/components/collections/collection-color';
import { DataGate } from '@/components/data-gate';
import { EmptyState, PageContainer, PageHeader } from '@/components/page';
import { useT } from '@/i18n';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { useLibraryBooks, useLibraryStore } from '@/store/library-store';

function Collections() {
  const { t } = useT();
  const run = useAction();
  const collections = useLibraryStore((s) => s.collections);
  const books = useLibraryBooks();
  const createCollection = useLibraryStore((s) => s.createCollection);

  const createButton = (
    <CollectionDialog
      trigger={
        <Button className="h-11 rounded-xl px-4 font-bold md:h-10">
          <Plus aria-hidden />
          <span className="hidden sm:inline">{t.collections.newCollection}</span>
          <span className="sr-only sm:hidden">{t.collections.newCollection}</span>
        </Button>
      }
      onSave={(values) => run(() => createCollection(values), () => toast.success(t.toast.collectionCreated))}
    />
  );

  return (
    <PageContainer>
      <PageHeader title={t.collections.title} description={t.collections.subtitle} actions={createButton} />
      {collections.length === 0 ? (
        <EmptyState icon="🔖" title={t.collections.emptyTitle} body={t.collections.emptyBody} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {collections.map((c) => {
            const members = books.filter((b) => b.collectionIds.includes(c.id));
            return (
              <li key={c.id} className="flex min-w-0">
                <Link
                  href={`/collections/${c.id}`}
                  className={cn(
                    'flex min-w-0 flex-1 flex-col gap-4 rounded-2xl border border-t-4 border-border bg-card p-5 shadow-lg transition hover:border-muted-foreground/40',
                    collectionAccent[c.color],
                  )}
                >
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-white">{c.name}</h2>
                    {c.description && <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>}
                  </div>
                  <div className="mt-auto space-y-2 border-t border-border/80 pt-3">
                    <p className="text-xs font-semibold text-muted-foreground">{t.common.books(members.length)}</p>
                    <ul className="space-y-1">
                      {members.slice(0, 3).map((b) => (
                        <li key={b.id} className="truncate text-sm text-foreground/90">
                          {b.title}
                        </li>
                      ))}
                      {members.length > 3 && <li className="text-xs text-muted-foreground">+{members.length - 3}</li>}
                    </ul>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}

export default function CollectionsPage() {
  return (
    <DataGate>
      <Collections />
    </DataGate>
  );
}
