'use client';

import { useState, type ReactElement } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useT } from '@/i18n';

interface ConfirmDialogProps {
  /** Omit when opening from elsewhere (e.g. a menu item) via `open`/`onOpenChange`. */
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** Destructive confirmation (delete book, delete collection, reset demo data). */
export function ConfirmDialog({ trigger, title, description, confirmLabel, onConfirm, ...controlled }: ConfirmDialogProps) {
  const { t } = useT();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlled.open ?? localOpen;
  const setOpen = controlled.onOpenChange ?? setLocalOpen;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger render={trigger} />}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11 md:h-9">{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" className="h-11 md:h-9" onClick={() => {
              setOpen(false);
              onConfirm();
            }}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
