'use client';

import type { ReactNode } from 'react';
import { CloudOff, LockKeyhole, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, PageContainer, PageSkeleton } from '@/components/page';
import { useT } from '@/i18n';
import { useLibraryStore } from '@/store/library-store';

function LoadError() {
  const { t } = useT();
  const error = useLibraryStore((s) => s.error);
  const load = useLibraryStore((s) => s.load);

  const kind = error?.isUnauthorized ? 'unauthorized' : error?.isDisabled ? 'disabled' : error?.isForbidden ? 'forbidden' : error?.isNetwork ? 'network' : 'generic';
  const Icon = kind === 'unauthorized' || kind === 'forbidden' || kind === 'disabled' ? LockKeyhole : kind === 'network' ? CloudOff : TriangleAlert;
  const copy = t.state[kind];

  return (
    <PageContainer className="max-w-xl">
      <EmptyState
        icon={<Icon className="mx-auto size-10 text-muted-foreground" aria-hidden />}
        title={copy.title}
        body={copy.body}
        action={
          kind === 'unauthorized' ? (
            // A reload sends the browser back through Cloudflare Access to sign in again.
            <Button className="h-11 px-5 font-bold" onClick={() => window.location.reload()}>
              {t.state.signInAgain}
            </Button>
          ) : (
            <Button className="h-11 px-5 font-bold" onClick={() => void load()}>
              {t.state.retry}
            </Button>
          )
        }
      />
    </PageContainer>
  );
}

/** Renders children once the user's data has loaded; otherwise a skeleton or an error screen with a way out. */
export function DataGate({ children }: { children: ReactNode }) {
  const status = useLibraryStore((s) => s.status);
  if (status === 'ready') return <>{children}</>;
  if (status === 'error') return <LoadError />;
  return <PageSkeleton />;
}
