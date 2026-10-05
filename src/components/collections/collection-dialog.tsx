'use client';

import { useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { CollectionInput } from '@/lib/api';
import type { Collection } from '@/types/library';
import { COLLECTION_COLORS, collectionDot } from './collection-color';

interface CollectionDialogProps {
  /** Omit when opening from elsewhere (e.g. a menu item) via `open`/`onOpenChange`. */
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  collection?: Collection;
  /** Resolves true when saved; the dialog stays open (keeping the user's input) on false. */
  onSave: (values: CollectionInput) => Promise<boolean> | boolean | void;
}

/** Create (no `collection`) or rename/edit an existing collection. */
export function CollectionDialog({ trigger, collection, onSave, ...controlled }: CollectionDialogProps) {
  const { t } = useT();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlled.open ?? localOpen;
  const setOpen = controlled.onOpenChange ?? setLocalOpen;
  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [color, setColor] = useState<Collection['color']>(collection?.color ?? 'amber');
  const [error, setError] = useState(false);

  const reset = () => {
    setName(collection?.name ?? '');
    setDescription(collection?.description ?? '');
    setColor(collection?.color ?? 'amber');
    setError(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} onOpenChangeComplete={(isOpen) => isOpen || reset()}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return setError(true);
            const saved = await onSave({ name: name.trim(), description: description.trim() || undefined, color });
            if (saved !== false) setOpen(false);
          }}
          className="space-y-5"
        >
          <DialogHeader>
            <DialogTitle>{collection ? t.collections.renameTitle : t.collections.createTitle}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={error}>
              <FieldLabel htmlFor="collection-name">{t.collections.name} *</FieldLabel>
              <Input
                id="collection-name"
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(false);
                }}
                placeholder={t.collections.namePlaceholder}
                aria-invalid={error}
                className="h-11 md:h-9"
              />
              {error && <FieldError>{t.collections.nameRequired}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="collection-description">{t.collections.description}</FieldLabel>
              <Textarea id="collection-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{t.collections.color}</FieldLabel>
              <div role="radiogroup" aria-label={t.collections.color} className="flex gap-2">
                {COLLECTION_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      'flex size-11 items-center justify-center rounded-full border-2 md:size-9',
                      color === c ? 'border-foreground' : 'border-transparent',
                    )}
                  >
                    <span className={cn('size-6 rounded-full', collectionDot[c])} />
                  </button>
                ))}
              </div>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="secondary" className="h-11 md:h-9" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" className="h-11 font-bold md:h-9">
              {collection ? t.common.save : t.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
