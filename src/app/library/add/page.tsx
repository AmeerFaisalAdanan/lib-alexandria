'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { dictionaries } from '../../../i18n/translations';
import { ReadingStatus, BookLanguage, BookOwner } from '../../../types/library';
import { ArrowLeft, Plus } from 'lucide-react';

export default function AddBookPage() {
  const router = useRouter();
  const addBook = useLibraryStore((state) => state.addBook);
  const categories = useLibraryStore((state) => state.categories);
  const collections = useLibraryStore((state) => state.collections);
  const language = useLibraryStore((state) => state.language);

  const dict = dictionaries[language].form;

  // Form State
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publicationYear, setPublicationYear] = useState<string>('');
  const [bookLanguage, setBookLanguage] = useState<BookLanguage>('Bahasa Melayu');
  const [category, setCategory] = useState<string>('Kitab Turath');
  const [owner, setOwner] = useState<BookOwner>('Alep');
  const [location, setLocation] = useState<string>('Library Alep');
  const [status, setStatus] = useState<ReadingStatus>('want_to_read');
  const [progress, setProgress] = useState<number>(0);
  const [price, setPrice] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [tagsInput, setTagsInput] = useState<string>('');
  const [collectionId, setCollectionId] = useState<string>('');

  const [errors, setErrors] = useState<{ title?: string; author?: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { title?: string; author?: string } = {};
    if (!title.trim()) newErrors.title = dict.required;
    if (!author.trim()) newErrors.author = dict.required;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    addBook({
      title: title.trim(),
      author: author.trim(),
      isbn: isbn.trim() || undefined,
      publisher: publisher.trim() || undefined,
      publicationYear: publicationYear ? parseInt(publicationYear) : undefined,
      language: bookLanguage,
      category,
      owner,
      location: location.trim() || `Library ${owner}`,
      status,
      progress: status === 'completed' ? 100 : progress,
      price: price ? parseFloat(price) : undefined,
      purchaseDate: purchaseDate || undefined,
      notes: notes.trim() || undefined,
      tags,
      collectionId: collectionId || undefined,
    });

    router.push('/library');
  };

  return (
    <main class="flex-1 p-4 md:p-8 space-y-6 max-w-2xl w-full mx-auto pb-24 md:pb-8">
      <!-- Back Link -->
      <Link href="/library" class="inline-flex items-center space-x-2 text-xs md:text-sm font-semibold text-slate-400 hover:text-amber-400 transition">
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Library</span>
      </Link>

      <div class="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
        <div>
          <h1 class="text-2xl font-extrabold text-white tracking-tight">{dict.addTitle}</h1>
          <p class="text-xs text-slate-400 mt-1">Single-column mobile-first form</p>
        </div>

        <form onSubmit={handleSubmit} class="space-y-4">
          <!-- Title -->
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">{dict.title}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Bidayah Al-Hidayah"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 touch-target"
            />
            {errors.title && <p class="text-xs text-rose-400 font-medium">{errors.title}</p>}
          </div>

          <!-- Author -->
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">{dict.author}</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. Imam Al-Ghazali"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 touch-target"
            />
            {errors.author && <p class="text-xs text-rose-400 font-medium">{errors.author}</p>}
          </div>

          <!-- Owner Selector -->
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">{dict.owner}</label>
            <div class="grid grid-cols-2 gap-2">
              {(['Alep', 'Taqim'] as BookOwner[]).map((o) => (
                <button
                  type="button"
                  key={o}
                  onClick={() => {
                    setOwner(o);
                    setLocation(`Library ${o}`);
                  }}
                  class={`py-3 rounded-xl border text-center font-bold text-sm touch-target transition ${
                    owner === o ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  👤 {o}
                </button>
              ))}
            </div>
          </div>

          <!-- Location -->
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">{dict.location}</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Library Taqim / Main Shelf"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 touch-target"
            />
          </div>

          <!-- Category & Language Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">{dict.category}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500 touch-target"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">{dict.language}</label>
              <select
                value={bookLanguage}
                onChange={(e) => setBookLanguage(e.target.value as BookLanguage)}
                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500 touch-target"
              >
                <option value="Bahasa Melayu">Bahasa Melayu</option>
                <option value="English">English</option>
              </select>
            </div>
          </div>

          <!-- Status Selector -->
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">{dict.status}</label>
            <div class="grid grid-cols-3 gap-2 text-xs font-bold">
              {(['want_to_read', 'reading', 'completed'] as ReadingStatus[]).map((st) => (
                <button
                  type="button"
                  key={st}
                  onClick={() => {
                    setStatus(st);
                    if (st === 'completed') setProgress(100);
                  }}
                  class={`py-3 rounded-xl border text-center capitalize touch-target transition ${
                    status === st ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  {st === 'reading' ? 'Reading' : st === 'completed' ? 'Completed' : 'Want to Read'}
                </button>
              ))}
            </div>
          </div>

          {/* Progress Slider (Only if Reading) */}
          {status === 'reading' && (
            <div class="space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-300 font-bold">{dict.progress}</span>
                <span class="text-amber-400 font-extrabold text-sm">{progress}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={progress}
                onChange={(e) => setProgress(parseInt(e.target.value))}
                class="w-full accent-amber-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          )}

          <!-- Price & Purchase Date Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">{dict.price}</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="RM 0.00"
                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 touch-target"
              />
            </div>

            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">{dict.purchaseDate}</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500 touch-target"
              />
            </div>
          </div>

          <!-- Tags -->
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">{dict.tags}</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. Islamic, Turath, Reference"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 touch-target"
            />
          </div>

          <!-- Notes -->
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">{dict.notes}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Personal notes..."
              class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <!-- DESKTOP SUBMIT BUTTON -->
          <div class="hidden md:block pt-4">
            <button
              type="submit"
              class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 rounded-xl text-base shadow-lg transition"
            >
              {dict.submitAdd}
            </button>
          </div>
        </form>
      </div>

      <!-- STICKY MOBILE ACTION BAR (Avoids Keyboard Clipping) -->
      <div class="md:hidden fixed bottom-16 left-0 right-0 p-4 bg-slate-900/90 border-t border-slate-800 backdrop-blur-md z-30">
        <button
          onClick={handleSubmit}
          class="w-full bg-amber-500 text-slate-950 font-bold py-3.5 rounded-xl text-base shadow-lg active:bg-amber-400 touch-target"
        >
          {dict.submitAdd}
        </button>
      </div>
    </main>
  );
}
