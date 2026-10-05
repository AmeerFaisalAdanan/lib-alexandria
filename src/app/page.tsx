'use client';

import Link from 'next/link';
import { useLibraryStore } from '../store/useLibraryStore';
import { dictionaries } from '../i18n/translations';
import { BookOpen, CheckCircle, Clock, Plus, ArrowRight, TrendingUp } from 'lucide-react';

export default function DashboardPage() {
  const books = useLibraryStore((state) => state.books);
  const language = useLibraryStore((state) => state.language);
  const updateProgress = useLibraryStore((state) => state.updateProgress);
  const dict = dictionaries[language].dashboard;

  // Calculated Metrics
  const totalBooks = books.length;
  const readingBooks = books.filter((b) => b.status === 'reading');
  const completedBooks = books.filter((b) => b.status === 'completed');
  const wantToReadBooks = books.filter((b) => b.status === 'want_to_read');

  const totalValue = books.reduce((acc, b) => acc + (b.price || 0), 0);
  const avgPrice = totalBooks > 0 ? (totalValue / totalBooks).toFixed(2) : '0.00';

  const alepBooks = books.filter((b) => b.owner === 'Alep').length;
  const taqimBooks = books.filter((b) => b.owner === 'Taqim').length;
  const alepPercentage = totalBooks > 0 ? Math.round((alepBooks / totalBooks) * 100) : 0;
  const taqimPercentage = totalBooks > 0 ? Math.round((taqimBooks / totalBooks) * 100) : 0;

  const recentlyAdded = [...books]
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .slice(0, 4);

  return (
    <main class="flex-1 p-4 md:p-8 space-y-8 max-w-7xl w-full mx-auto">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 class="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{dict.title}</h1>
          <p class="text-xs md:text-sm text-slate-400 mt-1">{dict.subtitle}</p>
        </div>
        <div class="flex items-center space-x-3">
          <Link
            href="/library/add"
            class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs md:text-sm shadow-md shadow-amber-500/20 transition flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>{dict.quickActions}</span>
          </Link>
        </div>
      </div>

      <!-- CALCULATED STATS GRID -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
        <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 md:p-5 relative overflow-hidden group hover:border-amber-500/30 transition shadow-lg">
          <div class="flex items-center justify-between pb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">{dict.totalBooks}</span>
            <span class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-sm">📚</span>
          </div>
          <div class="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{totalBooks}</div>
          <div class="mt-2 text-[11px] text-slate-400 flex items-center space-x-1">
            <span class="text-emerald-400 font-semibold">{totalBooks}</span>
            <span>{dict.indexed}</span>
          </div>
        </div>

        <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 md:p-5 relative overflow-hidden group hover:border-emerald-500/30 transition shadow-lg">
          <div class="flex items-center justify-between pb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">{dict.collectionValue}</span>
            <span class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-sm">💰</span>
          </div>
          <div class="text-2xl md:text-3xl font-extrabold text-emerald-400 tracking-tight">RM {totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div class="mt-2 text-[11px] text-slate-400 flex items-center space-x-1">
            <span>{dict.avgPrice} {avgPrice} {dict.perBook}</span>
          </div>
        </div>

        <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 md:p-5 relative overflow-hidden group hover:border-amber-500/30 transition shadow-lg">
          <div class="flex items-center justify-between pb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Alep</span>
            <div class="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center">A</div>
          </div>
          <div class="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{alepBooks} <span class="text-xs font-normal text-slate-400">{dict.booksCount}</span></div>
          <div class="mt-2 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div class="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${alepPercentage}%` }}></div>
          </div>
        </div>

        <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 md:p-5 relative overflow-hidden group hover:border-emerald-500/30 transition shadow-lg">
          <div class="flex items-center justify-between pb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Taqim</span>
            <div class="w-7 h-7 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center">T</div>
          </div>
          <div class="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{taqimBooks} <span class="text-xs font-normal text-slate-400">{dict.booksCount}</span></div>
          <div class="mt-2 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div class="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${taqimPercentage}%` }}></div>
          </div>
        </div>
      </div>

      <!-- STATUS BREAKDOWN STRIP -->
      <div class="grid grid-cols-3 gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-center">
        <div class="space-y-1">
          <span class="text-xs text-slate-400 flex items-center justify-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>Want to Read</span>
          </span>
          <span class="text-lg md:text-xl font-bold text-slate-200 block">{wantToReadBooks.length}</span>
        </div>
        <div class="space-y-1 border-x border-slate-800">
          <span class="text-xs text-slate-400 flex items-center justify-center space-x-1">
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Reading</span>
          </span>
          <span class="text-lg md:text-xl font-bold text-amber-400 block">{readingBooks.length}</span>
        </div>
        <div class="space-y-1">
          <span class="text-xs text-slate-400 flex items-center justify-center space-x-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Completed</span>
          </span>
          <span class="text-lg md:text-xl font-bold text-emerald-400 block">{completedBooks.length}</span>
        </div>
      </div>

      <!-- MAIN SPLIT LAYOUT -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">

        <!-- CURRENTLY READING (2 Columns) -->
        <div class="lg:col-span-2 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <h2 class="text-lg font-bold text-white tracking-tight">{dict.currentlyReading}</h2>
            </div>
            <Link href="/library" class="text-xs text-amber-400 font-semibold hover:underline flex items-center space-x-1">
              <span>{dict.viewAll}</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {readingBooks.length === 0 ? (
            <div class="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 text-center space-y-3">
              <div class="text-3xl">📖</div>
              <p class="text-sm text-slate-400">{dict.noReading}</p>
              <Link href="/library" class="inline-block bg-slate-800 hover:bg-slate-700 text-xs font-semibold px-4 py-2 rounded-xl text-slate-200">
                {dict.browseLibrary}
              </Link>
            </div>
          ) : (
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {readingBooks.map((book) => (
                <div key={book.id} class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition space-y-4 shadow-md flex flex-col justify-between">
                  <div class="space-y-2">
                    <div class="flex items-start justify-between">
                      <span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-semibold px-2.5 py-0.5 rounded-md">
                        {book.category}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${book.owner === 'Alep' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        👤 {book.owner}
                      </span>
                    </div>
                    <Link href={`/library/${book.id}`} class="block group">
                      <h3 class="font-bold text-slate-100 text-base leading-snug group-hover:text-amber-400 transition">
                        {book.title}
                      </h3>
                      <p class="text-xs text-slate-400 mt-0.5">{book.author}</p>
                    </Link>
                  </div>

                  <!-- Progress Controls -->
                  <div class="space-y-2 pt-2 border-t border-slate-800/80">
                    <div class="flex items-center justify-between text-xs text-slate-400">
                      <span>Progress</span>
                      <span class="font-bold text-amber-400">{book.progress}%</span>
                    </div>
                    <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div class="bg-amber-500 h-full rounded-full transition-all duration-300" style={{ width: `${book.progress}%` }}></div>
                    </div>
                    <div class="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                      <button onClick={() => updateProgress(book.id, Math.max(0, book.progress - 10))} class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200">
                        -10%
                      </button>
                      <button onClick={() => updateProgress(book.id, Math.min(100, book.progress + 25))} class="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold">
                        +25%
                      </button>
                      <button onClick={() => updateProgress(book.id, 100)} class="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold">
                        Complete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <!-- RECENTLY ADDED (1 Column Side Panel) -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold text-white tracking-tight">{dict.recentlyAdded}</h2>
            <Link href="/library" class="text-xs text-amber-400 font-semibold hover:underline">
              {dict.viewAll}
            </Link>
          </div>

          <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
            {recentlyAdded.map((book) => (
              <Link key={book.id} href={`/library/${book.id}`} class="block p-3 rounded-xl hover:bg-slate-800/60 transition border border-transparent hover:border-slate-800">
                <div class="flex items-start justify-between">
                  <div>
                    <h4 class="font-bold text-sm text-slate-200 line-clamp-1">{book.title}</h4>
                    <p class="text-xs text-slate-400 mt-0.5">{book.author}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${book.owner === 'Alep' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {book.owner}
                  </span>
                </div>
                <div class="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                  <span>📍 {book.location}</span>
                  <span class="text-slate-500">{new Date(book.addedAt).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
