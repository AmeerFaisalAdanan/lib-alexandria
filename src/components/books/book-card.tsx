'use client';

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { CategoryBadge, OwnerBadge, StatusBadge } from '@/components/books/badges';
import { RatingStars } from '@/components/books/rating-input';
import type { Book } from '@/types/library';

/** Compact stacked card: primary facts only; secondary details live on the detail page. */
export function BookCard({ book }: { book: Book }) {
  return (
    <Link
      href={`/library/${book.id}`}
      className="group flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-md transition hover:border-muted-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:p-5"
    >
      <div className="min-w-0 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <CategoryBadge category={book.category} className="max-w-[70%]" />
          <OwnerBadge owner={book.owner} />
        </div>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-base leading-snug font-bold break-words text-foreground transition group-hover:text-accent-foreground">
            {book.title}
          </h3>
          <p className="mt-1 truncate text-sm text-muted-foreground">{book.author}</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-3 text-xs text-muted-foreground">
        <StatusBadge status={book.status} progress={book.progress} />
        <span className="flex min-w-0 items-center gap-1">
          <RatingStars value={book.rating} className="mr-1" />
          <MapPin className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{book.location}</span>
        </span>
      </div>
    </Link>
  );
}
