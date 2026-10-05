'use client';

import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { OptionSelect } from '@/components/option-select';
import { RatingInput } from '@/components/books/rating-input';
import { collectionDot } from '@/components/collections/collection-color';
import { useT, type Dictionary } from '@/i18n';
import { parseTags } from '@/lib/library';
import { cn, sliderValue } from '@/lib/utils';
import { useLibraryStore, type NewBook } from '@/store/library-store';
import { BOOK_LANGUAGES, OWNERS, READING_STATUSES, type Book } from '@/types/library';

const optionalText = z.string().trim();

function makeSchema(t: Dictionary['form']) {
  const maxYear = new Date().getFullYear() + 1;
  return z.object({
    title: z.string().trim().min(1, t.titleRequired),
    author: z.string().trim().min(1, t.authorRequired),
    isbn: optionalText.refine((v) => !v || /^(\d{9}[\dXx]|\d{13})$/.test(v.replace(/[-\s]/g, '')), t.isbnInvalid),
    publisher: optionalText,
    publicationYear: optionalText.refine((v) => !v || (/^\d{4}$/.test(v) && +v >= 1000 && +v <= maxYear), t.yearInvalid),
    language: z.enum(BOOK_LANGUAGES),
    category: z.string().min(1),
    owner: z.enum(OWNERS),
    location: optionalText,
    status: z.enum(READING_STATUSES),
    progress: z.number().min(0).max(100),
    rating: z.number().min(1).max(5).optional(),
    price: optionalText.refine((v) => !v || (Number.isFinite(+v) && +v >= 0), t.priceInvalid),
    purchaseDate: optionalText,
    notes: optionalText,
    tags: optionalText,
    collectionIds: z.array(z.string()),
  });
}

export type BookFormValues = z.infer<ReturnType<typeof makeSchema>>;

const toFormValues = (book?: Book, defaults?: { category: string }): BookFormValues => ({
  title: book?.title ?? '',
  author: book?.author ?? '',
  isbn: book?.isbn ?? '',
  publisher: book?.publisher ?? '',
  publicationYear: book?.publicationYear?.toString() ?? '',
  language: book?.language ?? 'Bahasa Melayu',
  category: book?.category ?? defaults?.category ?? '',
  owner: book?.owner ?? 'Alep',
  location: book?.location ?? '',
  status: book?.status ?? 'want_to_read',
  progress: book?.progress ?? 0,
  rating: book?.rating,
  price: book?.price?.toString() ?? '',
  purchaseDate: book?.purchaseDate ?? '',
  notes: book?.notes ?? '',
  tags: book?.tags.join(', ') ?? '',
  collectionIds: book?.collectionIds ?? [],
});

const toBook = (v: BookFormValues): NewBook => ({
  title: v.title,
  author: v.author,
  isbn: v.isbn.replace(/[-\s]/g, '') || undefined,
  publisher: v.publisher || undefined,
  publicationYear: v.publicationYear ? Number(v.publicationYear) : undefined,
  language: v.language,
  category: v.category,
  owner: v.owner,
  location: v.location || `Library ${v.owner}`,
  status: v.status,
  progress: v.status === 'reading' ? v.progress : v.status === 'completed' ? 100 : 0,
  rating: v.rating,
  price: v.price ? Math.round(Number(v.price) * 100) / 100 : undefined,
  purchaseDate: v.purchaseDate || undefined,
  notes: v.notes || undefined,
  tags: parseTags(v.tags),
  collectionIds: v.collectionIds,
});

interface BookFormProps {
  book?: Book;
  submitLabel: string;
  onSubmit: (book: NewBook) => void;
  onCancel: () => void;
}

/** Shared by Add and Edit. */
export function BookForm({ book, submitLabel, onSubmit, onCancel }: BookFormProps) {
  const { t } = useT();
  const categories = useLibraryStore((s) => s.categories);
  const collections = useLibraryStore((s) => s.collections);
  const schema = useMemo(() => makeSchema(t.form), [t.form]);

  const form = useForm<BookFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(book, { category: categories[0]?.name ?? '' }),
    mode: 'onTouched',
  });
  const { register, control, handleSubmit, formState } = form;
  const errors = formState.errors;
  const status = useWatch({ control, name: 'status' });
  const owner = useWatch({ control, name: 'owner' });

  const control44 = 'h-11 md:h-9';

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(toBook(v)))} noValidate className="space-y-6">
      <FieldSet className="rounded-2xl border border-border bg-card p-4 md:p-6">
        <FieldLegend className="float-left mb-4 w-full">{t.form.sectionDetails}</FieldLegend>
        <FieldGroup className="clear-both">
          <Field data-invalid={!!errors.title}>
            <FieldLabel htmlFor="title">{t.form.title} *</FieldLabel>
            <Input id="title" autoComplete="off" className={control44} aria-invalid={!!errors.title} {...register('title')} />
            <FieldError errors={[errors.title]} />
          </Field>
          <Field data-invalid={!!errors.author}>
            <FieldLabel htmlFor="author">{t.form.author} *</FieldLabel>
            <Input id="author" autoComplete="off" className={control44} aria-invalid={!!errors.author} {...register('author')} />
            <FieldError errors={[errors.author]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.isbn}>
              <FieldLabel htmlFor="isbn">{t.form.isbn}</FieldLabel>
              <Input id="isbn" inputMode="numeric" className={control44} aria-invalid={!!errors.isbn} {...register('isbn')} />
              <FieldError errors={[errors.isbn]} />
            </Field>
            <Field data-invalid={!!errors.publicationYear}>
              <FieldLabel htmlFor="publicationYear">{t.form.publicationYear}</FieldLabel>
              <Input
                id="publicationYear"
                inputMode="numeric"
                maxLength={4}
                className={control44}
                aria-invalid={!!errors.publicationYear}
                {...register('publicationYear')}
              />
              <FieldError errors={[errors.publicationYear]} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="publisher">{t.form.publisher}</FieldLabel>
            <Input id="publisher" className={control44} {...register('publisher')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="language">{t.form.language}</FieldLabel>
              <Controller
                control={control}
                name="language"
                render={({ field }) => (
                  <OptionSelect
                    id="language"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={BOOK_LANGUAGES.map((l) => ({ value: l, label: t.bookLanguage[l] }))}
                  />
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="category">{t.form.category}</FieldLabel>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <OptionSelect
                    id="category"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={categories.map((c) => ({ value: c.name, label: c.name }))}
                  />
                )}
              />
            </Field>
          </div>
        </FieldGroup>
      </FieldSet>

      <FieldSet className="rounded-2xl border border-border bg-card p-4 md:p-6">
        <FieldLegend className="float-left mb-4 w-full">{t.form.sectionOwnership}</FieldLegend>
        <FieldGroup className="clear-both">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="owner">{t.form.owner}</FieldLabel>
              <Controller
                control={control}
                name="owner"
                render={({ field }) => (
                  <OptionSelect id="owner" value={field.value} onValueChange={field.onChange} options={OWNERS.map((o) => ({ value: o, label: o }))} />
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="location">{t.form.location}</FieldLabel>
              <Input id="location" placeholder={`Library ${owner}`} className={control44} {...register('location')} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.price}>
              <FieldLabel htmlFor="price">{t.form.price}</FieldLabel>
              <Input id="price" inputMode="decimal" className={control44} aria-invalid={!!errors.price} {...register('price')} />
              <FieldError errors={[errors.price]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="purchaseDate">{t.form.purchaseDate}</FieldLabel>
              <Input id="purchaseDate" type="date" className={control44} {...register('purchaseDate')} />
            </Field>
          </div>
        </FieldGroup>
      </FieldSet>

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
          {collections.length > 0 && (
            <Controller
              control={control}
              name="collectionIds"
              render={({ field }) => (
                <Field>
                  <FieldLabel>{t.form.collections}</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {collections.map((c) => {
                      const on = field.value.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => field.onChange(on ? field.value.filter((id) => id !== c.id) : [...field.value, c.id])}
                          className={cn(
                            'flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition',
                            on ? 'border-primary bg-primary/15 text-accent-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <span aria-hidden className={cn('size-2 rounded-full', collectionDot[c.color])} />
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}
            />
          )}
          <Field>
            <FieldLabel htmlFor="notes">{t.form.notes}</FieldLabel>
            <Textarea id="notes" rows={4} className="min-h-28 text-base md:text-sm" {...register('notes')} />
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
