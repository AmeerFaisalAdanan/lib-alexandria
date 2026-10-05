'use client';

import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LanguageToggle } from '@/components/app-shell/language-toggle';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageContainer, PageHeader, PageSkeleton } from '@/components/page';
import { useHydrated } from '@/components/store-hydrator';
import { useT } from '@/i18n';
import { useLibraryStore } from '@/store/library-store';

function Settings() {
  const { t } = useT();
  const bookCount = useLibraryStore((s) => s.books.length);
  const collectionCount = useLibraryStore((s) => s.collections.length);
  const resetDemoData = useLibraryStore((s) => s.resetDemoData);

  return (
    <PageContainer className="max-w-2xl">
      <PageHeader title={t.settings.title} description={t.settings.subtitle} />

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div>
          <h2 className="font-bold text-white">{t.settings.languageTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.settings.languageDesc}</p>
        </div>
        <LanguageToggle size="lg" />
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div>
          <h2 className="font-bold text-white">{t.settings.demoTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.settings.demoDesc}</p>
          <p className="mt-2 text-xs font-semibold text-muted-foreground">{t.settings.stats(bookCount, collectionCount)}</p>
        </div>
        <ConfirmDialog
          trigger={
            <Button variant="destructive" className="h-11 w-full sm:w-auto">
              <RotateCcw aria-hidden />
              {t.settings.demoReset}
            </Button>
          }
          title={t.settings.demoResetTitle}
          description={t.settings.demoResetBody}
          confirmLabel={t.settings.demoResetConfirm}
          onConfirm={() => {
            resetDemoData();
            toast.success(t.toast.demoReset);
          }}
        />
      </section>
    </PageContainer>
  );
}

export default function SettingsPage() {
  const hydrated = useHydrated();
  return hydrated ? <Settings /> : <PageSkeleton />;
}
