'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { OptionSelect } from '@/components/option-select';
import { useT } from '@/i18n';
import { personName } from '@/lib/library';
import { useLibraryStore } from '@/store/library-store';
import type { Copy } from '@/types/library';

interface LoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copy: Copy;
  /** "borrow": the signed-in member borrows it. "lend": the owner picks who has it. */
  mode: 'borrow' | 'lend';
  /** Resolves true when saved. */
  onConfirm: (opts: { borrowerId?: string; dueAt?: string }) => Promise<boolean>;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function LoanDialog({ open, onOpenChange, copy, mode, onConfirm }: LoanDialogProps) {
  const { t } = useT();
  const users = useLibraryStore((s) => s.users);
  const loadUsers = useLibraryStore((s) => s.loadUsers);
  const [borrowerId, setBorrowerId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && mode === 'lend') void loadUsers().catch(() => undefined);
  }, [open, mode, loadUsers]);

  // The owner cannot borrow their own copy, so they are not offered as a borrower.
  const members = useMemo(() => users.filter((u) => u.id !== copy.owner.id), [users, copy.owner.id]);
  const needsBorrower = mode === 'lend';

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onOpenChangeComplete={(isOpen) => isOpen || (setBorrowerId(''), setDueAt(''))}>
      <DialogContent>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (needsBorrower && !borrowerId) return;
            setSaving(true);
            const ok = await onConfirm({ borrowerId: needsBorrower ? borrowerId : undefined, dueAt: dueAt || undefined });
            setSaving(false);
            if (ok) onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{mode === 'borrow' ? t.lending.borrowTitle : t.lending.lendTitle}</DialogTitle>
            <DialogDescription>
              {mode === 'borrow' ? t.lending.borrowDesc(copy.book.title) : t.lending.lendDesc(copy.book.title)}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {needsBorrower && (
              <Field>
                <FieldLabel htmlFor="loan-borrower">{t.lending.borrower}</FieldLabel>
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.lending.noMembers}</p>
                ) : (
                  <OptionSelect
                    id="loan-borrower"
                    value={borrowerId}
                    onValueChange={setBorrowerId}
                    options={[{ value: '', label: t.lending.chooseBorrower }, ...members.map((u) => ({ value: u.id, label: personName(u) }))]}
                  />
                )}
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="loan-due">{t.lending.dueDate}</FieldLabel>
              <Input id="loan-due" type="date" min={today()} value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-11 md:h-9" />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="secondary" className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" className="h-11 font-bold md:h-9" disabled={saving || (needsBorrower && !borrowerId)}>
              {mode === 'borrow' ? t.lending.confirmBorrow : t.lending.confirmLend}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
