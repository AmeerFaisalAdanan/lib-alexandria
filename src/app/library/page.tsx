'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLibraryStore } from '../../store/useLibraryStore';
import { dictionaries } from '../../i18n/translations';
import { ReadingStatus, BookLanguage, BookOwner } from '../../types/library';
import { Search, Filter, Grid, List, Plus, BookOpen, Star } from 'lucide-react';

export default function LibraryPage() {
  const books = useLibraryStore((state) => state.books);
  const categories = useLibraryStore((state) => state.categories);
  const language = useLibraryStore((state) => state.language);
  const dict = dictionaries[language].library;

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [selectedOwner, setSelectedOwner] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Combined Filtering Logic
  const filteredBooks = books.filter((book) => {
    // Search
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const matchTitle = book.title.toLowerCase().includes(q);
      const matchAuthor = book.author.toLowerCase().includes(q);
      const matchIsbn = book.isbn ? book.isbn.toLowerCase().includes(q) : false;
      if (!matchTitle && !matchAuthor && !matchIsbn) return false;
    }

    // Status
    if (selectedStatus !== 'all' && book.status !== selectedStatus) return false;

    // Category
    if (selectedCategory !== 'all' && book.category !== selectedCategory) return false;

    // Language
    if (selectedLanguage !== 'all' && book.language !== selectedLanguage) return false;

    // Owner
    if (selectedOwner !== 'all' && book.owner !== selectedOwner) return false;

    return true;
  });

  // Sorting Logic
  const sortedBooks = [...filteredBooks].sort((a, b) => {
    if (sortBy === 'title') return a.title.localeCompare(b.title);
    if (sortBy === 'author') return a.author.localeCompare(b.author);
    if (sortBy === 'progress') return b.progress - a.progress;
    if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
    // Default: recent
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  });

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedStatus('all');
    setSelectedCategory('all');
    setSelectedLanguage('all');
    setSelectedOwner('all');
    setSortBy('recent');
  };

  return (
    <main class="flex-1 p-4 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
      <!-- Top Title & Add Action -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{dict.title}</h1>
          <p class="text-xs md:text-sm text-slate-400 mt-0.5">
            {sortedBooks.length} {sortedBooks.length === 1 ? 'book' : 'books'} found
          </p>
        </div>
        <Link
          href="/library/add"
          class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs md:text-sm shadow-md transition flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span class="hidden sm:inline">Add Book</span>
        </Link>
      </div>

      <!-- SEARCH & CONTROLS TOOLBAR -->
      <div class="space-y-3">
        <div class="flex flex-col md:flex-row gap-3">
          <!-- Search Input -->
          <div class="relative flex-1">
            <Search class="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={dict.searchPlaceholder}
              class="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 touch-target"
            />
          </div>

          <!-- Mobile Filter Trigger Button -->
          <button
            onClick={() => setShowMobileFilters(true)}
            class="md:hidden flex items-center justify-center space-x-2 bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl text-sm font-semibold text-amber-400 touch-target"
          >
            <Filter className="w-4 h-4" />
            <span>{dict.filters}</span>
          </button>

          <!-- Desktop Sort Dropdown -->
          <div class="hidden md:flex items-center space-x-2">
            <span class="text-xs text-slate-400 font-medium whitespace-nowrap">{dict.sortBy}:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              class="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="recent">{dict.recent}</option>
              <option value="title">{dict.titleSort}</option>
              <option value="author">{dict.authorSort}</option>
              <option value="progress">{dict.progressSort}</option>
              <option value="rating">{dict.ratingSort}</option>
            </select>

            <!-- Grid vs Table View Switcher -->
            <div class="flex bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
              <button
                onClick={() => setViewMode('grid')}
                class={`p-1.5 rounded-lg ${viewMode === 'grid' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                class={`p-1.5 rounded-lg ${viewMode === 'table' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <!-- DESKTOP INLINE FILTER BAR -->
        <div class="hidden md:flex flex-wrap items-center gap-2 pt-1 text-xs">
          <!-- Status Tabs -->
          <div class="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
            {['all', 'reading', 'want_to_read', 'completed'].map((status) => (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                class={`px-3 py-1.5 rounded-lg transition font-medium capitalize ${
                  selectedStatus === status ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {status === 'all'
                  ? dict.allStatuses
                  : status === 'reading'
                  ? dict.reading
                  : status === 'want_to_read'
                  ? dict.wantToRead
                  : dict.completed}
              </button>
            ))}
          </div>

          <!-- Category Select -->
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            class="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">{dict.allCategories}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          <!-- Language Select -->
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            class="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">{dict.allLanguages}</option>
            <option value="English">English</option>
            <option value="Bahasa Melayu">Bahasa Melayu</option>
          </select>

          <!-- Owner Select -->
          <select
            value={selectedOwner}
            onChange={(e) => setSelectedOwner(e.target.value)}
            class="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">{dict.allOwners}</option>
            <option value="Alep">Alep</option>
            <option value="Taqim">Taqim</option>
          </select>

          {(searchQuery || selectedStatus !== 'all' || selectedCategory !== 'all' || selectedLanguage !== 'all' || selectedOwner !== 'all') && (
            <button
              onClick={resetFilters}
              class="text-amber-400 hover:underline px-2 py-1 font-medium text-xs ml-auto"
            >
              {dict.resetFilters}
            </button>
          )}
        </div>
      </div>

      <!-- CATALOG VIEW -->
      {sortedBooks.length === 0 ? (
        <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div class="text-4xl">🔍</div>
          <h3 class="text-lg font-bold text-white">{dict.emptyTitle}</h3>
          <p class="text-sm text-slate-400">{dict.emptySubtitle}</p>
          <button
            onClick={resetFilters}
            class="inline-block bg-slate-800 hover:bg-slate-700 text-xs font-semibold px-4 py-2 rounded-xl text-slate-200 mt-2"
          >
            {dict.resetFilters}
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {sortedBooks.map((book) => (
            <Link
              key={book.id}
              href={`/library/${book.id}`}
              class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition flex flex-col justify-between shadow-md relative group"
            >
              <div class="space-y-3">
                <div class="flex items-start justify-between">
                  <span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-semibold px-2.5 py-0.5 rounded-md">
                    {book.category}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${book.owner === 'Alep' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    👤 {book.owner}
                  </span>
                </div>
                <div>
                  <h3 class="font-bold text-slate-100 text-base leading-snug group-hover:text-amber-400 transition">
                    {book.title}
                  </h3>
                  <p class="text-xs text-slate-400 mt-1">{book.author}</p>
                </div>
              </div>

              <div class="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span class="capitalize text-slate-300 font-medium">
                  {book.status === 'reading' ? `📖 ${book.progress}%` : book.status === 'completed' ? '✅ Completed' : '⏱️ Want to Read'}
                </span>
                <span class="text-slate-400">📍 {book.location}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* DENSE TABLE VIEW FOR DESKTOP */
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <table class="w-full text-left text-xs md:text-sm text-slate-300">
            <thead class="bg-slate-950 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th class="px-6 py-3.5">{dict.titleSort}</th>
                <th class="px-6 py-3.5">{dict.authorSort}</th>
                <th class="px-6 py-3.5">Category</th>
                <th class="px-6 py-3.5">Owner</th>
                <th class="px-6 py-3.5">Status</th>
                <th class="px-6 py-3.5 text-right">{dict.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/80">
              {sortedBooks.map((book) => (
                <tr key={book.id} class="hover:bg-slate-800/40 transition">
                  <td class="px-6 py-4 font-bold text-slate-100">
                    <Link href={`/library/${book.id}`} class="hover:text-amber-400">
                      {book.title}
                    </Link>
                  </td>
                  <td class="px-6 py-4 text-slate-400">{book.author}</td>
                  <td class="px-6 py-4">
                    <span class="bg-slate-800 text-slate-300 text-xs px-2.5 py-1 rounded-md font-medium">
                      {book.category}
                    </span>
                  </td>
                  <td class="px-6 py-4">
                    <span className={`text-xs font-bold ${book.owner === 'Alep' ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {book.owner}
                    </span>
                  </td>
                  <td class="px-6 py-4 capitalize text-slate-300">
                    {book.status === 'reading' ? `📖 ${book.progress}%` : book.status === 'completed' ? '✅ Completed' : '⏱️ Want to Read'}
                  </td>
                  <td class="px-6 py-4 text-right">
                    <Link href={`/library/${book.id}`} class="text-amber-400 hover:underline font-semibold text-xs">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <!-- MOBILE BOTTOM SHEET FILTERS MODAL -->
      {showMobileFilters && (
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center md:hidden">
          <div class="bg-slate-900 border-t border-slate-800 rounded-t-3xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-6 animate-in slide-in-from-bottom">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 class="text-lg font-bold text-white">{dict.filters}</h3>
              <button
                onClick={() => setShowMobileFilters(false)}
                class="text-slate-400 text-lg font-bold touch-target px-2"
              >
                ✕
              </button>
            </div>

            <!-- Status Filter -->
            <div class="space-y-2">
              <label class="text-xs font-bold text-slate-300 uppercase">Status</label>
              <div class="grid grid-cols-2 gap-2 text-xs">
                {['all', 'reading', 'want_to_read', 'completed'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(status)}
                    class={`p-2.5 rounded-xl border text-center capitalize font-semibold ${
                      selectedStatus === status
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {status === 'all'
                      ? dict.allStatuses
                      : status === 'reading'
                      ? dict.reading
                      : status === 'want_to_read'
                      ? dict.wantToRead
                      : dict.completed}
                  </button>
                ))}
              </div>
            </div>

            <!-- Owner Filter -->
            <div class="space-y-2">
              <label class="text-xs font-bold text-slate-300 uppercase">Owner</label>
              <div class="grid grid-cols-3 gap-2 text-xs">
                {['all', 'Alep', 'Taqim'].map((owner) => (
                  <button
                    key={owner}
                    onClick={() => setSelectedOwner(owner)}
                    class={`p-2.5 rounded-xl border text-center font-semibold ${
                      selectedOwner === owner
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {owner === 'all' ? dict.allOwners : owner}
                  </button>
                ))}
              </div>
            </div>

            <!-- Category Filter -->
            <div class="space-y-2">
              <label class="text-xs font-bold text-slate-300 uppercase">Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200"
              >
                <option value="all">{dict.allCategories}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div class="flex items-center space-x-3 pt-3">
              <button
                onClick={() => {
                  resetFilters();
                  setShowMobileFilters(false);
                }}
                class="w-1/2 bg-slate-800 text-slate-200 font-semibold py-3 rounded-xl text-sm"
              >
                {dict.resetFilters}
              </button>
              <button
                onClick={() => setShowMobileFilters(false)}
                class="w-1/2 bg-amber-500 text-slate-950 font-bold py-3 rounded-xl text-sm"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
