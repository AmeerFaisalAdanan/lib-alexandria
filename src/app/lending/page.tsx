'use client';

import { useMemo, useState } from 'react';
import { DataGate } from '@/components/data-gate';
import { CopyRow } from '@/components/lending/copy-row';
import { EmptyState, PageContainer, PageHeader } from '@/components/page';
import { useT } from '@/i18n';
import { LENDING_VIEWS, lendingView, type LendingView } from '@/lib/library';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';

function Lending() {
  const { t } = useT();
  const me = useLibraryStore((s) => s.me);
  const copies = useLibraryStore((s) => s.copies);
  const [view, setView] = useState<LendingView>('out');

  const counts = useMemo(
    () => Object.fromEntries(LENDING_VIEWS.map((v) => [v, lendingView(copies, v, me?.id ?? '').length])) as Record<LendingView, number>,
    [copies, me?.id],
  );
  const shown = useMemo(() => lendingView(copies, view, me?.id ?? ''), [copies, view, me?.id]);

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={t.lending.title} description={t.lending.subtitle} />

      <div role="group" aria-label={t.lending.title} className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 sm:grid-cols-4">
        {LENDING_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={cn(
              'flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition md:text-sm',
              view === v ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="truncate">{t.lending.views[v]}</span>
            <span className="tabular-nums opacity-80">{counts[v]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="🤝" title={t.lending.empty[view].title} body={t.lending.empty[view].body} />
      ) : (
        <ul className="space-y-3">
          {shown.map((c) => (
            <CopyRow key={c.id} copy={c} showBook />
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

export default function LendingPage() {
  return (
    <DataGate>
      <Lending />
    </DataGate>
  );
}
