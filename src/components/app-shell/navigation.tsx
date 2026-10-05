'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Bookmark, Home, PlusCircle, Settings, type LucideIcon } from 'lucide-react';
import { useT, type Dictionary } from '@/i18n';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/library-store';
import { useHydrated } from '@/components/store-hydrator';
import { OwnerAvatar } from '@/components/books/badges';
import { LanguageToggle } from './language-toggle';

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: (t: Dictionary) => string;
  short: (t: Dictionary) => string;
  match: (path: string) => boolean;
}

const NAV: NavItem[] = [
  { href: '/', icon: Home, label: (t) => t.dashboard.title, short: (t) => t.nav.home, match: (p) => p === '/' },
  {
    href: '/library',
    icon: BookOpen,
    label: (t) => t.nav.library,
    short: (t) => t.nav.libraryShort,
    match: (p) => p.startsWith('/library') && p !== '/library/add',
  },
  { href: '/library/add', icon: PlusCircle, label: (t) => t.nav.addBook, short: (t) => t.nav.add, match: (p) => p === '/library/add' },
  {
    href: '/collections',
    icon: Bookmark,
    label: (t) => t.nav.collections,
    short: (t) => t.nav.collections,
    match: (p) => p.startsWith('/collections'),
  },
  { href: '/settings', icon: Settings, label: (t) => t.nav.settings, short: (t) => t.nav.settings, match: (p) => p.startsWith('/settings') },
];

function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  return (
    <Link href="/" className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <span
        aria-hidden
        className={cn(
          'flex items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 shadow-lg shadow-amber-500/20',
          compact ? 'size-8 text-base' : 'size-9 text-xl',
        )}
      >
        🏛️
      </span>
      <span>
        <span className="block leading-none font-bold tracking-tight text-white">{t.common.appName}</span>
        {!compact && (
          <span className="text-[10px] font-semibold tracking-widest text-accent-foreground uppercase">{t.common.sharedLibrary}</span>
        )}
      </span>
    </Link>
  );
}

export function Navigation() {
  const pathname = usePathname();
  const { t } = useT();
  const hydrated = useHydrated();
  const bookCount = useLibraryStore((s) => s.books.length);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar backdrop-blur-xl md:flex">
        <div className="border-b border-sidebar-border p-6">
          <Brand />
        </div>
        <nav aria-label={t.nav.mainNavigation} className="flex-1 space-y-1.5 px-3 py-6">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition',
                  active
                    ? 'border-primary/20 bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                <item.icon className="size-4" aria-hidden />
                <span className="flex-1">{item.label(t)}</span>
                {item.href === '/library' && hydrated && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
                    {bookCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-sidebar-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t.nav.language}</span>
            <LanguageToggle />
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-2">
            <div className="flex -space-x-2">
              <OwnerAvatar owner="Alep" className="ring-2 ring-background" />
              <OwnerAvatar owner="Taqim" className="ring-2 ring-background" />
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground">{t.common.keepers}</div>
              <div className="text-[11px] text-muted-foreground">{t.common.keepersCaption}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 py-2 backdrop-blur md:hidden">
        <Brand compact />
        <LanguageToggle />
      </header>

      {/* Mobile bottom navigation */}
      <nav
        aria-label={t.nav.mainNavigation}
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-lg md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-center',
                  active ? 'font-bold text-accent-foreground' : 'text-muted-foreground',
                )}
              >
                <item.icon className="size-5" aria-hidden />
                <span className="w-full truncate text-[11px] leading-none">{item.short(t)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
