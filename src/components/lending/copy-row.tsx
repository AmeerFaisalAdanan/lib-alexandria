'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useT } from '@/i18n';
import { isOverdue, personName } from '@/lib/library';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';
import type { Copy } from '@/types/library';
import { CopyDialog } from './copy-dialog';
import { LoanDialog } from './loan-dialog';

/** One physical copy: who bought it, where it is, who has it, and the actions the viewer is allowed. */
export function CopyRow({ copy, showBook = false }: { copy: Copy; showBook?: boolean }) {
  const { t, formatDate, formatPrice } = useT();
  const run = useAction();
  const me = useLibraryStore((s) => s.me);
  const { lendCopy, returnCopy, updateCopy, deleteCopy } = useLibraryStore.getState();
  const [dialog, setDialog] = useState<'borrow' | 'lend' | 'edit' | 'remove' | null>(null);

  if (!me) return null;
  const isOwner = copy.owner.id === me.id;
  const loan = copy.loan;
  const isBorrower = loan?.borrower.id === me.id;
  const overdue = isOverdue(copy);
  const who = (p: Copy['owner']) => (p.id === me.id ? t.lending.you : personName(p));

  return (
    <li className="min-w-0 space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="copy-row">
      {showBook && (
        <Link href={`/library/${encodeURIComponent(copy.book.id)}`} className="group block min-w-0">
          <p className="line-clamp-2 leading-snug font-bold break-words group-hover:text-accent-foreground">{copy.book.title}</p>
          <p className="truncate text-sm text-muted-foreground">{copy.book.author}</p>
        </Link>
      )}

      <div className="space-y-1 text-sm">
        <p className="min-w-0 break-words">
          <span className="font-semibold">{t.lending.boughtBy(who(copy.owner))}</span>
          {copy.purchaseDate && <span className="text-muted-foreground"> {t.lending.boughtOn(formatDate(copy.purchaseDate))}</span>}
        </p>
        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {copy.location && (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{t.lending.at(copy.location)}</span>
            </span>
          )}
          {isOwner && copy.price !== undefined && <span className="tabular-nums">{formatPrice(copy.price)}</span>}
        </p>
      </div>

      {loan ? (
        <div
          className={cn(
            'rounded-xl border px-3 py-2 text-sm',
            overdue ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-primary/20 bg-primary/10 text-accent-foreground',
          )}
        >
          <p className="font-semibold break-words">{t.lending.borrowedBy(who(loan.borrower))}</p>
          <p className="text-xs">
            {t.lending.since(formatDate(loan.borrowedAt))}
            {loan.dueAt && ` · ${t.lending.due(formatDate(loan.dueAt))}`}
            {overdue && ` · ${t.lending.overdue}`}
          </p>
        </div>
      ) : (
        <p className="inline-flex rounded-md border border-success/20 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">{t.lending.available}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!loan && !isOwner && (
          <Button className="h-11 font-bold md:h-9" onClick={() => setDialog('borrow')}>
            {t.lending.borrow}
          </Button>
        )}
        {!loan && isOwner && (
          <Button variant="secondary" className="h-11 md:h-9" onClick={() => setDialog('lend')}>
            {t.lending.lend}
          </Button>
        )}
        {loan && (isOwner || isBorrower) && (
          <Button
            variant="secondary"
            className="h-11 md:h-9"
            onClick={() => void run(() => returnCopy(copy.id), () => toast.success(t.toast.returned))}
          >
            {t.lending.markReturned}
          </Button>
        )}
        {isOwner && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={t.lending.copyActions} />}>
              <MoreVertical aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem className="min-h-10" onClick={() => setDialog('edit')}>
                <Pencil aria-hidden />
                {t.lending.editCopy}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" className="min-h-10" disabled={!!loan} onClick={() => setDialog('remove')}>
                <Trash2 aria-hidden />
                {loan ? t.lending.onLoanCannotRemove : t.lending.removeCopy}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Dialogs live outside the menu so closing them never leaves the menu open. */}
      <LoanDialog
        open={dialog === 'borrow' || dialog === 'lend'}
        onOpenChange={(open) => !open && setDialog(null)}
        copy={copy}
        mode={dialog === 'lend' ? 'lend' : 'borrow'}
        onConfirm={(opts) =>
          run(
            () => lendCopy(copy.id, opts),
            () => toast.success(dialog === 'lend' ? t.toast.lent : t.toast.borrowed),
          )
        }
      />
      {isOwner && (
        <>
          <CopyDialog
            key={copy.id + copy.location + copy.purchaseDate + copy.price}
            open={dialog === 'edit'}
            onOpenChange={(open) => !open && setDialog(null)}
            copy={copy}
            onSave={(values) => run(() => updateCopy(copy.id, values), () => toast.success(t.toast.copyUpdated))}
          />
          <ConfirmDialog
            open={dialog === 'remove'}
            onOpenChange={(open) => !open && setDialog(null)}
            title={t.lending.removeCopyTitle}
            description={t.lending.removeCopyBody}
            confirmLabel={t.lending.removeCopyConfirm}
            onConfirm={() => void run(() => deleteCopy(copy.id), () => toast.success(t.toast.copyRemoved))}
          />
        </>
      )}
    </li>
  );
}
