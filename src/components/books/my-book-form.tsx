'use client';

import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { OptionSelect } from '@/components/option-select';
import { RatingInput } from '@/components/books/rating-input';
import { useT } from '@/i18n';
import { parseTags, type EntryPatch } from '@/lib/library';
import { sliderValue } from '@/lib/utils';
import { READING_STATUSES, type LibraryBook } from '@/types/library';

const text = z.string().trim();

function makeSchema() {
  return z.object({
    status: z.enum(READING_STATUSES),
    progress: z.number().min(0).max(100),
    rating: z.number().min(1).max(5).optional(),
    notes: text,
    tags: text,
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

const toFormValues = (book: LibraryBook): FormValues => ({
  status: book.status,
  progress: book.progress,
  rating: book.rating,
  notes: book.notes,
  tags: book.tags.join(', '),
});

const toPatch = (v: FormValues): EntryPatch => ({
  status: v.status,
  progress: v.status === 'reading' ? v.progress : v.status === 'completed' ? 100 : 0,
  rating: v.rating ?? null,
  notes: v.notes,
  tags: parseTags(v.tags),
});

interface MyBookFormProps {
  book: LibraryBook;
  submitLabel: string;
  /** Resolves when saved; rejections are handled by the caller (the form just re-enables). */
  onSubmit: (patch: EntryPatch) => Promise<void> | void;
  onCancel: () => void;
}

/** Edits the signed-in user's own state for a catalogue book. Catalogue facts (title, author…) are read-only. */
export function MyBookForm({ book, submitLabel, onSubmit, onCancel }: MyBookFormProps) {
  const { t } = useT();
  const schema = useMemo(() => makeSchema(), []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(book),
    mode: 'onTouched',
  });
  const { register, control, handleSubmit, formState } = form;
  const status = useWatch({ control, name: 'status' });

  const control44 = 'h-11 md:h-9';

  return (
    <form onSubmit={handleSubmit(async (v) => onSubmit(toPatch(v)))} noValidate className="space-y-6">
      <FieldSet className="rounded-2xl border border-border bg-card p-4 md:p-6">
        <FieldLegend className="float-left mb-4 w-full">{t.form.sectionReading}</FieldLegend>
        <FieldGroup className="clear-both">
          <Field>
            <FieldLabel htmlFor="status">{t.form.status}</FieldLabel>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <OptionSelect
                  id="status"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={READING_STATUSES.map((s) => ({ value: s, label: t.status[s] }))}
                />
              )}
            />
          </Field>
          {status === 'reading' && (
            <Controller
              control={control}
              name="progress"
              render={({ field }) => (
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel>{t.form.progress}</FieldLabel>
                    <span className="text-sm font-bold text-accent-foreground tabular-nums">{field.value}%</span>
                  </div>
                  <Slider
                    value={[field.value]}
                    min={0}
                    max={100}
                    step={5}
                    aria-label={t.form.progress}
                    onValueChange={(v) => field.onChange(sliderValue(v))}
                    className="py-2"
                  />
                </Field>
              )}
            />
          )}
          <Controller
            control={control}
            name="rating"
            render={({ field }) => (
              <Field>
                <FieldLabel>{t.form.rating}</FieldLabel>
                <RatingInput value={field.value} onChange={field.onChange} />
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>

      <FieldSet className="rounded-2xl border border-border bg-card p-4 md:p-6">
        <FieldLegend className="float-left mb-4 w-full">{t.form.sectionPersonal}</FieldLegend>
        <FieldGroup className="clear-both">
          <Field>
            <FieldLabel htmlFor="tags">{t.form.tags}</FieldLabel>
            <Input id="tags" className={control44} {...register('tags')} />
            <FieldDescription>{t.form.tagsHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="notes">{t.form.notes}</FieldLabel>
            <Textarea id="notes" rows={4} maxLength={5000} className="min-h-28 text-base md:text-sm" {...register('notes')} />
          </Field>
        </FieldGroup>
      </FieldSet>

      {/* Sticky on mobile so the keyboard never hides the submit button. */}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="button" variant="secondary" className="h-11 flex-1 md:h-10 md:flex-none" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" className="h-11 flex-[2] font-bold md:h-10 md:flex-none" disabled={formState.isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
