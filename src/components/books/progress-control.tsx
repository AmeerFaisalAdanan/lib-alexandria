'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useT } from '@/i18n';
import { isReadyToComplete } from '@/lib/library';
import { useAction } from '@/lib/use-action';
import { cn, sliderValue } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';
import type { LibraryBook } from '@/types/library';

const STEPS = [0, 25, 50, 75, 100];

/** Progress slider + quick steps. Reaching 100% asks the reader to confirm completion. */
export function ProgressControl({ book, compact = false }: { book: LibraryBook; compact?: boolean }) {
  const { t } = useT();
  const run = useAction();
  const updateEntry = useLibraryStore((s) => s.updateEntry);
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? book.progress;

  const commit = (value: number) => {
    setDraft(null);
    if (value === book.progress) return;
    void run(
      () => updateEntry(book.id, { progress: value }),
      () => toast.success(t.toast.progressUpdated, { id: `progress-${book.id}` }),
    );
  };

  const complete = () =>
    void run(
      () => updateEntry(book.id, { status: 'completed' }),
      () => toast.success(t.toast.bookCompleted),
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-muted-foreground">{t.book.progress}</span>
        <span className="font-bold text-accent-foreground tabular-nums">{shown}%</span>
      </div>
      <Slider
        value={[shown]}
        min={0}
        max={100}
        step={5}
        aria-label={t.book.progress}
        onValueChange={(v) => setDraft(sliderValue(v))}
        onValueCommitted={(v) => commit(sliderValue(v))}
        className="py-2"
      />
      {!compact && (
        <div className="grid grid-cols-5 gap-1.5">
          {STEPS.map((step) => (
            <Button
              key={step}
              type="button"
              variant={book.progress === step ? 'default' : 'secondary'}
              className="h-11 tabular-nums md:h-9"
              onClick={() => commit(step)}
            >
              {step}%
            </Button>
          ))}
        </div>
      )}
      {isReadyToComplete(book) && (
        <div
          role="status"
          className={cn('flex flex-col gap-3 rounded-xl border border-success/30 bg-success/10 p-3 sm:flex-row sm:items-center')}
        >
          <p className="flex-1 text-sm text-success">{t.book.finishedPrompt}</p>
          <Button type="button" onClick={complete} className="h-11 bg-success text-primary-foreground hover:bg-success/80 md:h-9">
            <CheckCircle2 aria-hidden />
            {t.book.markCompleted}
          </Button>
        </div>
      )}
    </div>
  );
}
