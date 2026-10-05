'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Activity, ChevronRight, LibraryBig, LogOut, TriangleAlert, Users } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LanguageToggle } from '@/components/app-shell/language-toggle';
import { UserAvatar } from '@/components/books/badges';
import { DataGate } from '@/components/data-gate';
import { PageContainer, PageHeader } from '@/components/page';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';

/** Development-only: pick which user the dev authenticator signs you in as (see backend AUTH_MODE=dev). */
function DevUserSwitch({ current }: { current: string }) {
  const { t } = useT();
  const [email, setEmail] = useState(current);

  return (
    <section className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <h2 className="font-bold text-white">{t.settings.devTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.settings.devNotice}</p>
        </div>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const next = email.trim().toLowerCase();
          if (!next) return;
          document.cookie = `dev_user=${encodeURIComponent(next)}; path=/; SameSite=Lax`;
          window.location.reload();
        }}
      >
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label={t.settings.devUserLabel}
          placeholder={t.settings.devUserLabel}
          className="h-11 text-base md:text-sm"
        />
        <Button type="submit" variant="secondary" className="h-11">
          {t.settings.devSwitch}
        </Button>
      </form>
    </section>
  );
}

function Settings() {
  const { t } = useT();
  const me = useLibraryStore((s) => s.me);
  const bookCount = useLibraryStore((s) => s.library.length);
  const collectionCount = useLibraryStore((s) => s.collections.length);

  return (
    <PageContainer className="max-w-2xl">
      <PageHeader title={t.settings.title} description={t.settings.subtitle} />

      {me && (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
          <h2 className="font-bold text-white">{t.settings.accountTitle}</h2>
          <div className="flex items-center gap-3">
            <UserAvatar name={me.name || me.email} className="size-10 text-base" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{me.name || me.email}</p>
              <p className="truncate text-sm text-muted-foreground">{t.settings.signedInAs(me.email)}</p>
            </div>
          </div>
          {me.authMode === 'cloudflare' && (
            // Served by Cloudflare Access on this origin; clears the Access session.
            <a href="/cdn-cgi/access/logout" className={cn(buttonVariants({ variant: 'secondary' }), 'h-11 w-full sm:w-auto')}>
              <LogOut aria-hidden />
              {t.settings.signOut}
            </a>
          )}
        </section>
      )}

      {/* Only administrators see this. It is a convenience: the pages and every /api/admin route check the role on the server. */}
      {me?.role === 'admin' && (
        <section aria-labelledby="admin-heading" className="space-y-3 rounded-2xl border border-border bg-card p-5 md:p-6">
          <div>
            <h2 id="admin-heading" className="font-bold text-white">
              {t.settings.adminTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{t.admin.subtitle}</p>
          </div>
          <ul className="space-y-2">
            {(
              [
                ['/settings/members', Users, t.admin.members, t.admin.membersDesc],
                ['/settings/catalogue', LibraryBig, t.admin.catalogue, t.admin.catalogueDesc],
                ['/settings/system', Activity, t.admin.system, t.admin.systemDesc],
              ] as const
            ).map(([href, Icon, title, desc]) => (
              <li key={href}>
                <Link href={href} className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2 transition hover:bg-secondary/60">
                  <Icon className="size-5 shrink-0 text-accent-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{desc}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {me?.authMode === 'dev' && <DevUserSwitch current={me.email} />}

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div>
          <h2 className="font-bold text-white">{t.settings.languageTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.settings.languageDesc}</p>
        </div>
        <LanguageToggle size="lg" />
      </section>

      <section className="space-y-1 rounded-2xl border border-border bg-card p-5 md:p-6">
        <h2 className="font-bold text-white">{t.settings.dataTitle}</h2>
        <p className="text-sm text-muted-foreground">{t.settings.dataDesc}</p>
        <p className="pt-1 text-xs font-semibold text-muted-foreground">{t.settings.stats(bookCount, collectionCount)}</p>
      </section>
    </PageContainer>
  );
}

export default function SettingsPage() {
  return (
    <DataGate>
      <Settings />
    </DataGate>
  );
}
