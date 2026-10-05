'use client';

import { Star } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

interface RatingInputProps {
  value?: number;
  onChange: (rating: number | undefined) => void;
  id?: string;
}

/** 1–5 stars; pressing the current rating again clears it. */
export function RatingInput({ value, onChange, id }: RatingInputProps) {
  const { t } = useT();
  return (
    <div id={id} role="radiogroup" aria-label={t.book.rating} className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (value ?? 0) >= n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={value === n ? t.book.clearRating : t.book.rateStars(n)}
            onClick={() => onChange(value === n ? undefined : n)}
            className="flex size-11 items-center justify-center rounded-lg transition hover:bg-secondary/60 md:size-9"
          >
            <Star
              aria-hidden
              className={cn('size-6 md:size-5', filled ? 'fill-primary text-primary' : 'text-muted-foreground/60')}
            />
          </button>
        );
      })}
    </div>
  );
}

export function RatingStars({ value, className }: { value?: number; className?: string }) {
  if (!value) return null;
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={cn('size-3', n <= value ? 'fill-primary text-primary' : 'text-muted-foreground/40')} />
      ))}
    </span>
  );
}
