'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { CopyInput } from '@/lib/api';
import { useT } from '@/i18n';
import type { Copy } from '@/types/library';

interface CopyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to record a new copy; pass one to edit it. */
  copy?: Copy;
  /** Resolves true when saved; the dialog stays open (keeping the input) on false. */
  onSave: (values: CopyInput) => Promise<boolean>;
}

/** Record or edit a physical copy: where it is, what it cost and when it was bought. */
export function CopyDialog({ open, onOpenChange, copy, onSave }: CopyDialogProps) {
  const { t } = useT();
  const [location, setLocation] = useState(copy?.location ?? '');
  const [price, setPrice] = useState(copy?.price?.toString() ?? '');
  const [purchaseDate, setPurchaseDate] = useState(copy?.purchaseDate ?? '');
  const [priceError, setPriceError] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setLocation(copy?.location ?? '');
    setPrice(copy?.price?.toString() ?? '');
    setPurchaseDate(copy?.purchaseDate ?? '');
    setPriceError(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onOpenChangeComplete={(isOpen) => isOpen || reset()}>
      <DialogContent>
        <form
          noValidate
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const p = price.trim();
            if (p && !(Number.isFinite(+p) && +p >= 0)) return setPriceError(true);
            setSaving(true);
            const saved = await onSave({
              // null clears a value when editing; on create they are simply left out
              location: location.trim() || null,
              price: p ? Math.round(Number(p) * 100) / 100 : null,
              purchaseDate: purchaseDate || null,
            });
            setSaving(false);
            if (saved) onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{copy ? t.lending.copyEditTitle : t.lending.copyAddTitle}</DialogTitle>
            <DialogDescription>{t.lending.copyDesc}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="copy-location">{t.lending.location}</FieldLabel>
              <Input
                id="copy-location"
                value={location}
                maxLength={120}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t.lending.locationPlaceholder}
                className="h-11 md:h-9"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={priceError}>
                <FieldLabel htmlFor="copy-price">{t.lending.price}</FieldLabel>
                <Input
                  id="copy-price"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setPriceError(false);
                  }}
                  aria-invalid={priceError}
                  className="h-11 md:h-9"
                />
                {priceError ? <FieldError>{t.lending.priceInvalid}</FieldError> : <FieldDescription>{t.lending.priceHint}</FieldDescription>}
              </Field>
              <Field>
                <FieldLabel htmlFor="copy-date">{t.lending.purchaseDate}</FieldLabel>
                <Input id="copy-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="h-11 md:h-9" />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="secondary" className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" className="h-11 font-bold md:h-9" disabled={saving}>
              {t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
