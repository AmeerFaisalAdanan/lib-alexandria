'use client';

import { BookOpen, CheckCircle2, Clock } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { BookOwner, ReadingStatus } from '@/types/library';

const statusStyle: Record<ReadingStatus, { icon: typeof Clock; className: string }> = {
  want_to_read: { icon: Clock, className: 'bg-info/10 text-info border-info/20' },
  reading: { icon: BookOpen, className: 'bg-primary/10 text-accent-foreground border-primary/20' },
  completed: { icon: CheckCircle2, className: 'bg-success/10 text-success border-success/20' },
};

export function StatusBadge({ status, progress, className }: { status: ReadingStatus; progress?: number; className?: string }) {
  const { t } = useT();
  const { icon: Icon, className: tone } = statusStyle[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {t.status[status]}
      {status === 'reading' && progress !== undefined && <span className="tabular-nums">· {progress}%</span>}
    </span>
  );
}

export const ownerTone: Record<BookOwner, string> = {
  Alep: 'bg-primary/15 text-accent-foreground',
  Taqim: 'bg-success/15 text-success',
};

export function OwnerBadge({ owner, className }: { owner: BookOwner; className?: string }) {
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-xs font-bold whitespace-nowrap', ownerTone[owner], className)}>
      {owner}
    </span>
  );
}

export function OwnerAvatar({ owner, className }: { owner: BookOwner; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground',
        owner === 'Alep' ? 'bg-primary' : 'bg-success',
        className,
      )}
    >
      {owner[0]}
    </span>
  );
}

export function CategoryBadge({ category, className }: { category: string; className?: string }) {
  return (
    <span
      className={cn(
        'truncate rounded-md border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-accent-foreground',
        className,
      )}
    >
      {category}
    </span>
  );
}
