'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { DataGate } from '@/components/data-gate';
import { OptionSelect } from '@/components/option-select';
import { ScanCard, type ScanOutcome } from '@/components/scan/scan-card';
import { EmptyState, PageContainer, PageHeader, PageSkeleton } from '@/components/page';
import { bookLanguageLabel, useT, type Dictionary } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { distinct } from '@/lib/library';
import { isbnFromBarcode } from '@/lib/isbn';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';

const LANGUAGES = ['English', 'Bahasa Melayu'] as const;
const text = z.string().trim();

function makeSchema(t: Dictionary['catalogue']) {
  const maxYear = new Date().getFullYear() + 1;
  return z.object({
    title: text.min(1, t.titleRequired).max(300),
    author: text.min(1, t.authorRequired).max(300),
    isbn: text.refine((v) => !v || /^(\d{9}[\dXx]|\d{13})$/.test(v.replace(/[-\s]/g, '')), t.isbnInvalid),
    publicationYear: text.refine((v) => !v || (/^\d{4}$/.test(v) && +v >= 1000 && +v <= maxYear), t.yearInvalid),
    publisher: text.max(200),
    language: z.enum(LANGUAGES),
    category: text.min(1, t.categoryRequired).max(80),
  });
}
type Values = z.infer<ReturnType<typeof makeSchema>>;

const checkbox = 'size-5 shrink-0 accent-[var(--primary)]';

/** Publish a new book to the shared catalogue; everyone in the library sees it straight away. */
function NewBookForm() {
  const { t } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const me = useLibraryStore((s) => s.me);
  const catalogue = useLibraryStore((s) => s.catalogue);
  const { publishBook, addToLibrary, createCopy } = useLibraryStore.getState();

  const [alsoAdd, setAlsoAdd] = useState(true);
  const [alsoOwn, setAlsoOwn] = useState(false);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<ScanOutcome['note']>(null);
  const [looking, setLooking] = useState(false);
  const schema = useMemo(() => makeSchema(t.catalogue), [t.catalogue]);
  const categories = useMemo(() => distinct(catalogue.map((b) => b.category)), [catalogue]);

  const { register, handleSubmit, setValue, getValues, control, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: params.get('title') ?? '', author: '', isbn: '', publicationYear: '', publisher: '', language: 'Bahasa Melayu', category: '' },
    mode: 'onTouched',
  });
  const { errors } = formState;
  const language = useWatch({ control, name: 'language' });
  const control44 = 'h-11 md:h-9';
  const isbnValue = useWatch({ control, name: 'isbn' });
  const lookupIsbn = isbnFromBarcode(isbnValue ?? '');

  /** Puts scanned details into the form. What the scan did not find is left as the user has it. */
  const applyScan = ({ info, note }: ScanOutcome) => {
    const set = (name: 'title' | 'author' | 'isbn' | 'publisher' | 'publicationYear' | 'category', value: string | undefined) => {
      if (value) setValue(name, value, { shouldDirty: true, shouldValidate: true });
    };
    set('title', info.title);
    set('author', info.author);
    set('isbn', info.isbn);
    set('publisher', info.publisher);
    set('publicationYear', info.publicationYear?.toString());
    if (info.language === 'English' || info.language === 'Bahasa Melayu') setValue('language', info.language, { shouldDirty: true });
    if (!getValues('category')) set('category', info.category); // never override a category the user chose
    setDuplicate(null);
    setScanNote(note);
  };

  const lookupTyped = async () => {
    if (!lookupIsbn) return;
    setLooking(true);
    try {
      applyScan({ info: { ...(await api.lookupIsbn(lookupIsbn)), isbn: lookupIsbn }, note: 'filled' });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_found') applyScan({ info: { isbn: lookupIsbn }, note: { notFound: lookupIsbn } });
      else if (e instanceof ApiError && (e.code === 'lookup_unavailable' || e.status === 502 || e.status === 503)) applyScan({ info: { isbn: lookupIsbn }, note: { busy: lookupIsbn } });
      else toast.error(errorMessage(e, t), { id: 'action-error' });
    } finally {
      setLooking(false);
    }
  };

  const back = (
    <Link href="/library/add" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-accent-foreground md:min-h-0">
      <ArrowLeft className="size-4" aria-hidden />
      {t.catalogue.viewCatalogue}
    </Link>
  );

  if (!me?.canAddBooks) {
    return (
      <PageContainer className="max-w-xl">
        {back}
        <EmptyState icon="🔒" title={t.errors.submissionsDisabled} />
      </PageContainer>
    );
  }

  const submit = handleSubmit(async (v) => {
    setDuplicate(null);
    let bookId: string;
    try {
      const book = await publishBook({
        title: v.title,
        author: v.author,
        isbn: v.isbn.replace(/[-\s]/g, '') || undefined,
        publisher: v.publisher || undefined,
        publicationYear: v.publicationYear ? Number(v.publicationYear) : undefined,
        language: v.language,
        category: v.category,
      });
      bookId = book.id;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'duplicate' && e.existing) setDuplicate(e.existing);
      else toast.error(errorMessage(e, t), { id: 'action-error' });
      return;
    }
    toast.success(t.toast.bookPublished);

    // The book is published even if these follow-ups fail; say so and let the user retry from its page.
    try {
      if (alsoAdd) await addToLibrary(bookId);
      if (alsoOwn) await createCopy(bookId);
    } catch (e) {
      toast.error(errorMessage(e, t), { id: 'action-error' });
    }
    router.push(alsoAdd ? `/library/${encodeURIComponent(bookId)}` : '/library/add');
  });

  return (
    <PageContainer className="max-w-2xl">
      {back}
      <PageHeader title={t.catalogue.newTitle} description={t.catalogue.newSubtitle} />

      {(me.features.isbnLookup || me.features.coverScan) && <ScanCard features={me.features} onOutcome={applyScan} />}
      {scanNote && (
        <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-accent-foreground">
          {scanNote === 'filled' ? t.catalogue.scanFilled : 'busy' in scanNote ? t.catalogue.scanBusy(scanNote.busy) : t.catalogue.scanNotFound(scanNote.notFound)}
        </p>
      )}

      {duplicate && (
        <div role="alert" className="space-y-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <div>
            <p className="font-bold text-white">{t.catalogue.duplicateTitle}</p>
            <p className="text-sm text-muted-foreground">{t.catalogue.duplicateBody}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11 font-bold md:h-9"
              onClick={async () => {
                try {
                  await addToLibrary(duplicate);
                  toast.success(t.toast.bookAdded);
                } catch (e) {
                  if (!(e instanceof ApiError && e.status === 409)) return void toast.error(errorMessage(e, t), { id: 'action-error' });
                }
                router.push(`/library/${encodeURIComponent(duplicate)}`);
              }}
            >
              {t.catalogue.addExisting}
            </Button>
            <Link href="/library/add" className={cn(buttonVariants({ variant: 'secondary' }), 'h-11 md:h-9')}>
              {t.catalogue.viewCatalogue}
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={submit} noValidate className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <FieldGroup>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="nb-title">{t.catalogue.fieldTitle} *</FieldLabel>
              <Input id="nb-title" autoComplete="off" maxLength={300} className={control44} aria-invalid={!!errors.title} {...register('title')} />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field data-invalid={!!errors.author}>
              <FieldLabel htmlFor="nb-author">{t.catalogue.fieldAuthor} *</FieldLabel>
              <Input id="nb-author" autoComplete="off" maxLength={300} className={control44} aria-invalid={!!errors.author} {...register('author')} />
              <FieldError errors={[errors.author]} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.isbn}>
                <FieldLabel htmlFor="nb-isbn">{t.catalogue.fieldIsbn}</FieldLabel>
                <div className="flex gap-2">
                  <Input id="nb-isbn" inputMode="numeric" className={control44} aria-invalid={!!errors.isbn} {...register('isbn')} />
                  {me.features.isbnLookup && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 shrink-0 gap-1.5 md:h-9"
                      disabled={!lookupIsbn || looking}
                      aria-label={t.catalogue.scanLookupAria}
                      onClick={() => void lookupTyped()}
                    >
                      {looking ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
                      {t.catalogue.scanLookup}
                    </Button>
                  )}
                </div>
                <FieldError errors={[errors.isbn]} />
              </Field>
              <Field data-invalid={!!errors.publicationYear}>
                <FieldLabel htmlFor="nb-year">{t.catalogue.fieldYear}</FieldLabel>
                <Input id="nb-year" inputMode="numeric" maxLength={4} className={control44} aria-invalid={!!errors.publicationYear} {...register('publicationYear')} />
                <FieldError errors={[errors.publicationYear]} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="nb-publisher">{t.catalogue.fieldPublisher}</FieldLabel>
              <Input id="nb-publisher" maxLength={200} className={control44} {...register('publisher')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="nb-language">{t.catalogue.fieldLanguage}</FieldLabel>
                <OptionSelect
                  id="nb-language"
                  value={language}
                  onValueChange={(l) => setValue('language', l, { shouldDirty: true })}
                  options={LANGUAGES.map((l) => ({ value: l, label: bookLanguageLabel(t, l) }))}
                />
              </Field>
              <Field data-invalid={!!errors.category}>
                <FieldLabel htmlFor="nb-category">{t.catalogue.fieldCategory} *</FieldLabel>
                <Input id="nb-category" list="nb-categories" autoComplete="off" maxLength={80} className={control44} aria-invalid={!!errors.category} {...register('category')} />
                <datalist id="nb-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                {errors.category ? <FieldError errors={[errors.category]} /> : <FieldDescription>{t.catalogue.categoryHint}</FieldDescription>}
              </Field>
            </div>
          </FieldGroup>
        </div>

        <div className="space-y-1 rounded-2xl border border-border bg-card p-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-sm font-medium">
            <input type="checkbox" className={checkbox} checked={alsoAdd} onChange={(e) => setAlsoAdd(e.target.checked)} />
            {t.catalogue.alsoAdd}
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-sm font-medium">
            <input type="checkbox" className={checkbox} checked={alsoOwn} onChange={(e) => setAlsoOwn(e.target.checked)} />
            {t.catalogue.alsoOwn}
          </label>
        </div>

        <p className="text-sm text-muted-foreground">{t.catalogue.publishNote}</p>

        {/* Sticky on mobile so the keyboard never hides the submit button. */}
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
          <Link href="/library/add" className={cn(buttonVariants({ variant: 'secondary' }), 'h-11 flex-1 md:h-10 md:flex-none')}>
            {t.common.cancel}
          </Link>
          <Button type="submit" className="h-11 flex-[2] font-bold md:h-10 md:flex-none" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? t.catalogue.publishing : t.catalogue.publish}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}

export default function NewBookPage() {
  return (
    <DataGate>
      <Suspense fallback={<PageSkeleton />}>
        <NewBookForm />
      </Suspense>
    </DataGate>
  );
}
