import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn('mx-auto w-full max-w-7xl min-w-0 flex-1 space-y-6 p-4 md:p-8', className)}>{children}</main>;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-border/80 pb-5', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-balance text-white md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3 rounded-2xl border border-border bg-card/60 px-6 py-10 text-center', className)}>
      <div className="text-4xl" aria-hidden>
        {icon}
      </div>
      <h2 className="text-lg font-bold text-white">{title}</h2>
      {body && <p className="mx-auto max-w-sm text-sm text-pretty text-muted-foreground">{body}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

/** Shown while the user's data loads, so pages never flash empty or stale content. */
export function PageSkeleton() {
  return (
    <PageContainer>
      <span className="sr-only" role="status">
        Loading…
      </span>
      <Skeleton className="h-9 w-48" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </PageContainer>
  );
}
