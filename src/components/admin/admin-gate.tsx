'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { DataGate } from '@/components/data-gate';
import { EmptyState, PageContainer } from '@/components/page';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/i18n';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';

export function BackToSettings() {
  const { t } = useT();
  return (
    <Link href="/settings" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-accent-foreground md:min-h-0">
      <ArrowLeft className="size-4" aria-hidden />
      {t.admin.backToSettings}
    </Link>
  );
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { t } = useT();
  const role = useLibraryStore((s) => s.me?.role);
  // This is a convenience so members do not see a broken page. The real protection is the server: every
  // /api/admin/* route refuses anyone who is not an active administrator.
  if (role !== 'admin') {
    return (
      <PageContainer className="max-w-xl">
        <EmptyState
          icon="🔒"
          title={t.admin.noAccessTitle}
          body={t.admin.noAccessBody}
          action={
            <Link href="/settings" className={cn(buttonVariants(), 'h-11 px-5 font-bold')}>
              {t.admin.backToSettings}
            </Link>
          }
        />
      </PageContainer>
    );
  }
  return <>{children}</>;
}

/** Wraps an administration page: waits for the user's data, then shows the page only to administrators. */
export function AdminGate({ children }: { children: ReactNode }) {
  return (
    <DataGate>
      <AdminOnly>{children}</AdminOnly>
    </DataGate>
  );
}

/** Loading and error states for an admin resource. Renders `children` once there is data. */
export function AdminResource({
  loading,
  error,
  hasData,
  onRetry,
  children,
}: {
  loading: boolean;
  error: ApiError | null;
  hasData: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useT();
  if (hasData) return <>{children}</>;
  if (error) {
    return (
      <EmptyState
        icon="⚠️"
        title={error.isForbidden ? t.admin.noAccessTitle : t.state.generic.title}
        body={error.isForbidden ? t.admin.noAccessBody : t.admin.loadFailed}
        action={
          <Button className="h-11 px-5 font-bold" onClick={onRetry}>
            {t.admin.retry}
          </Button>
        }
      />
    );
  }
  // Inline placeholders: the page already has its <main>, and nesting a second one is invalid.
  return loading ? (
    <div role="status" className="space-y-3">
      <span className="sr-only">{t.common.loading}</span>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-2xl" />
      ))}
    </div>
  ) : null;
}
