'use client';

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState, PageContainer } from '@/components/page';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export default function NotFound() {
  const { t } = useT();
  return (
    <PageContainer className="max-w-xl">
      <EmptyState
        icon="🏛️"
        title={t.notFound.title}
        body={t.notFound.body}
        action={
          <Link href="/library" className={cn(buttonVariants(), 'h-11 px-5 font-bold')}>
            {t.nav.library}
          </Link>
        }
      />
    </PageContainer>
  );
}
