'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLibraryStore } from '../store/useLibraryStore';
import { dictionaries } from '../i18n/translations';
import { Home, BookOpen, PlusCircle, Bookmark, Settings, Search } from 'lucide-react';

export function Navigation() {
  const pathname = usePathname();
  const language = useLibraryStore((state) => state.language);
  const setLanguage = useLibraryStore((state) => state.setLanguage);
  const books = useLibraryStore((state) => state.books);
  const dict = dictionaries[language].nav;

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <>
      <!-- DESKTOP SIDEBAR -->
      <aside class="hidden md:flex flex-col w-64 bg-slate-900/90 border-r border-slate-800 fixed inset-y-0 z-30 backdrop-blur-xl">
        <!-- Brand Header -->
        <div class="p-6 border-b border-slate-800/80 flex items-center justify-between">
          <Link href="/" class="flex items-center space-x-3">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-amber-500/20">
              🏛️
            </div>
            <div>
              <h1 class="text-base font-bold tracking-tight text-white leading-none">Alexandria</h1>
              <span class="text-[10px] font-semibold text-amber-400 uppercase tracking-widest">{dict.sharedCollection}</span>
            </div>
          </Link>
        </div>

        <!-- Navigation Items -->
        <nav class="flex-1 px-3 py-6 space-y-1.5">
          <Link
            href="/"
            class={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              isActive('/') && pathname === '/'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm font-semibold'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>{dict.dashboard}</span>
          </Link>

          <Link
            href="/library"
            class={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              isActive('/library') && !pathname.startsWith('/library/add')
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm font-semibold'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <div class="flex items-center space-x-3">
              <BookOpen className="w-4 h-4" />
              <span>{dict.library}</span>
            </div>
            <span class="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full font-semibold">
              {books.length}
            </span>
          </Link>

          <Link
            href="/library/add"
            class={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              isActive('/library/add')
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm font-semibold'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>{dict.addBook}</span>
          </Link>

          <Link
            href="/collections"
            class={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              isActive('/collections')
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm font-semibold'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>{dict.collections}</span>
          </Link>

          <Link
            href="/settings"
            class={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              isActive('/settings')
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm font-semibold'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>{dict.settings}</span>
          </Link>
        </nav>

        <!-- Footer Profile & Language Selector -->
        <div class="p-4 border-t border-slate-800/80 bg-slate-900/50 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-400 font-medium">Language</span>
            <div class="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px] font-bold">
              <button
                onClick={() => setLanguage('en')}
                class={`px-2 py-0.5 rounded ${language === 'en' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}
              >
                EN
              </button>
              <button
                onClick={() => setLanguage('ms')}
                class={`px-2 py-0.5 rounded ${language === 'ms' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}
              >
                BM
              </button>
            </div>
          </div>
          <div class="flex items-center space-x-3 p-2 rounded-xl bg-slate-800/40 border border-slate-800">
            <div class="flex -space-x-2">
              <div class="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center ring-2 ring-slate-900">A</div>
              <div class="w-7 h-7 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center ring-2 ring-slate-900">T</div>
            </div>
            <div>
              <div class="text-xs font-semibold text-slate-200">Alep & Taqim</div>
              <div class="text-[10px] text-slate-400">Library DRI</div>
            </div>
          </div>
        </div>
      </aside>

      <!-- MOBILE HEADER -->
      <header class="md:hidden bg-slate-900 border-b border-slate-800 sticky top-0 z-30 px-4 py-3 flex items-center justify-between">
        <Link href="/" class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 text-base font-bold">🏛️</div>
          <h1 class="text-base font-bold tracking-tight text-white">Alexandria</h1>
        </Link>
        <div class="flex items-center space-x-2">
          <button
            onClick={() => setLanguage(language === 'en' ? 'ms' : 'en')}
            class="text-xs font-semibold px-2 py-1 bg-slate-800 text-amber-400 rounded-md border border-slate-700 uppercase"
          >
            {language}
          </button>
          <Link
            href="/library/add"
            class="bg-amber-500 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg touch-target flex items-center justify-center"
          >
            + Add
          </Link>
        </div>
      </header>

      <!-- MOBILE BOTTOM NAVIGATION -->
      <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-800 z-40 backdrop-blur-lg safe-bottom">
        <div class="max-w-md mx-auto grid grid-cols-5 text-center">
          <Link
            href="/"
            class={`py-2.5 flex flex-col items-center justify-center touch-target ${
              isActive('/') && pathname === '/' ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Home className="w-5 h-5" />
            <span class="text-[10px] mt-1">{dict.dashboard}</span>
          </Link>

          <Link
            href="/library"
            class={`py-2.5 flex flex-col items-center justify-center touch-target ${
              isActive('/library') && !pathname.startsWith('/library/add') ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            <span class="text-[10px] mt-1">{dict.library}</span>
          </Link>

          <Link
            href="/library/add"
            class={`py-2.5 flex flex-col items-center justify-center touch-target ${
              isActive('/library/add') ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            <PlusCircle className="w-5 h-5" />
            <span class="text-[10px] mt-1">{dict.addBook}</span>
          </Link>

          <Link
            href="/collections"
            class={`py-2.5 flex flex-col items-center justify-center touch-target ${
              isActive('/collections') ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Bookmark className="w-5 h-5" />
            <span class="text-[10px] mt-1">{dict.collections}</span>
          </Link>

          <Link
            href="/settings"
            class={`py-2.5 flex flex-col items-center justify-center touch-target ${
              isActive('/settings') ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span class="text-[10px] mt-1">{dict.settings}</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
