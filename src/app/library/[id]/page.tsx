'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { dictionaries } from '../../../i18n/translations';
import { ReadingStatus } from '../../../types/library';
import { ArrowLeft, Edit, Trash2, Star, CheckCircle, Tag, BookOpen, MapPin, User, Calendar, DollarSign } from 'lucide-react';

export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const books = useLibraryStore((state) => state.books);
  const language = useLibraryStore((state) => state.language);
  const updateReadingStatus = useLibraryStore((state) => state.updateReadingStatus);
  const updateProgress = useLibraryStore((state) => state.updateProgress);
  const updateRating = useLibraryStore((state) => state.updateRating);
  const updateNotes = useLibraryStore((state) => state.updateNotes);
  const deleteBook = useLibraryStore((state) => state.deleteBook);

  const dict = dictionaries[language].bookDetail;
  const book = books.find((b) => b.id === id);

  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(book?.notes || '');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  if (!book) {
    return (
      <main class="flex-1 p-8 text-center space-y-4 max-w-xl mx-auto">
        <h2 class="text-xl font-bold text-white">Book Not Found</h2>
        <p class="text-sm text-slate-400">The book you are looking for does not exist or has been removed.</p>
        <Link href="/library" class="inline-block bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-sm">
          {dict.back}
        </Link>
      </main>
    );
  }

  const handleNotesSave = () => {
    updateNotes(book.id, notesText);
    setIsEditingNotes(false);
  };

  const handleDeleteConfirm = () => {
    deleteBook(book.id);
    setShowDeleteModal(false);
    router.push('/library');
  };

  return (
    <main class="flex-1 p-4 md:p-8 space-y-6 max-w-4xl w-full mx-auto">
      <!-- Back Navigation -->
      <Link href="/library" class="inline-flex items-center space-x-2 text-xs md:text-sm font-semibold text-slate-400 hover:text-amber-400 transition">
        <ArrowLeft className="w-4 h-4" />
        <span>{dict.back}</span>
      </Link>

      <!-- BOOK HEADER CARD -->
      <div class="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
        <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div class="space-y-2">
            <div class="flex items-center space-x-2">
              <span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold px-3 py-1 rounded-lg">
                {book.category}
              </span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${book.owner === 'Alep' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                👤 {book.owner}
              </span>
            </div>
            <h1 class="text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
              {book.title}
            </h1>
            <p class="text-base md:text-lg text-slate-400 font-medium">{book.author}</p>
          </div>

          <!-- Actions Header -->
          <div class="flex items-center space-x-2">
            <Link
              href={`/library/${book.id}/edit`}
              class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs md:text-sm font-bold px-4 py-2.5 rounded-xl border border-slate-700 flex items-center space-x-2 transition"
            >
              <Edit className="w-4 h-4 text-amber-400" />
              <span>{dict.edit}</span>
            </Link>
            <button
              onClick={() => setShowDeleteModal(true)}
              class="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs md:text-sm font-bold px-4 py-2.5 rounded-xl border border-rose-500/20 flex items-center space-x-2 transition"
            >
              <Trash2 className="w-4 h-4" />
              <span>{dict.delete}</span>
            </button>
          </div>
        </div>

        <!-- OWNER & LOCATION HIGHLIGHT BOX -->
        <div class="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800/80 text-xs md:text-sm">
          <div class="flex items-center space-x-3">
            <User className="w-5 h-5 text-amber-400" />
            <div>
              <span class="text-slate-400 block text-[11px] font-semibold uppercase">{dict.owner}</span>
              <span class="font-bold text-slate-100">{book.owner}</span>
            </div>
          </div>
          <div class="flex items-center space-x-3 border-l border-slate-800 pl-4">
            <MapPin className="w-5 h-5 text-emerald-400" />
            <div>
              <span class="text-slate-400 block text-[11px] font-semibold uppercase">{dict.location}</span>
              <span class="font-bold text-slate-100">{book.location}</span>
            </div>
          </div>
        </div>

        <!-- INTERACTIVE READING STATUS & PROGRESS SECTION -->
        <div class="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-400 uppercase tracking-wider">{dict.readingStatus}</label>
              <div class="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                {(['want_to_read', 'reading', 'completed'] as ReadingStatus[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => updateReadingStatus(book.id, st)}
                    class={`px-3 py-1.5 rounded-lg font-bold capitalize transition ${
                      book.status === st ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st === 'reading' ? 'Reading' : st === 'completed' ? 'Completed' : 'Want to Read'}
                  </button>
                ))}
              </div>
            </div>

            <!-- Interactive Star Rating -->
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-400 uppercase tracking-wider">{dict.rating}</label>
              <div class="flex space-x-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => updateRating(book.id, star)}
                    class="p-1 text-amber-400 hover:scale-125 transition"
                  >
                    <Star className={`w-5 h-5 ${star <= (book.rating || 0) ? 'fill-amber-400' : 'text-slate-700'}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <!-- Progress Slider & Quick Actions -->
          <div class="space-y-2 pt-2 border-t border-slate-800/80">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-400 font-semibold">{dict.progress}</span>
              <span class="font-extrabold text-amber-400 text-sm">{book.progress}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={book.progress}
              onChange={(e) => updateProgress(book.id, parseInt(e.target.value))}
              class="w-full accent-amber-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div class="flex items-center justify-between text-xs pt-1">
              {[0, 25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  onClick={() => updateProgress(book.id, p)}
                  class={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                    book.progress === p ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>

          {book.status === 'completed' && (
            <div class="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-xs font-semibold flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{dict.completedMessage}</span>
            </div>
          )}
        </div>

        <!-- METADATA GRID -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs md:text-sm border-t border-slate-800/80 pt-6">
          <div>
            <span class="text-slate-400 block text-[11px] font-semibold uppercase">{dict.publisher}</span>
            <span class="font-semibold text-slate-200">{book.publisher || 'N/A'}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[11px] font-semibold uppercase">Language</span>
            <span class="font-semibold text-slate-200">{book.language}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[11px] font-semibold uppercase">{dict.purchaseDate}</span>
            <span class="font-semibold text-slate-200">{book.purchaseDate || 'N/A'}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[11px] font-semibold uppercase">{dict.price}</span>
            <span class="font-semibold text-emerald-400">{book.price ? `RM${book.price.toFixed(2)}` : 'N/A'}</span>
          </div>
        </div>

        <!-- TAGS -->
        {book.tags && book.tags.length > 0 && (
          <div class="space-y-2 border-t border-slate-800/80 pt-5">
            <span class="text-xs text-slate-400 font-bold uppercase tracking-wider">{dict.tags}</span>
            <div class="flex flex-wrap gap-2">
              {book.tags.map((tag) => (
                <span key={tag} class="bg-slate-800 text-slate-300 text-xs px-3 py-1 rounded-full border border-slate-700 flex items-center space-x-1">
                  <Tag className="w-3 h-3 text-amber-400" />
                  <span>{tag}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <!-- PERSONAL NOTES SECTION -->
        <div class="space-y-3 border-t border-slate-800/80 pt-5">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-400 font-bold uppercase tracking-wider">{dict.notes}</span>
            {!isEditingNotes && (
              <button
                onClick={() => setIsEditingNotes(true)}
                class="text-xs text-amber-400 font-semibold hover:underline"
              >
                Edit Notes
              </button>
            )}
          </div>

          {isEditingNotes ? (
            <div class="space-y-3">
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                rows={4}
                class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs md:text-sm text-slate-200 focus:outline-none focus:border-amber-500"
              />
              <div class="flex space-x-2">
                <button
                  onClick={handleNotesSave}
                  class="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs"
                >
                  Save Notes
                </button>
                <button
                  onClick={() => setIsEditingNotes(false)}
                  class="bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs md:text-sm text-slate-300 italic">
              {book.notes || dict.noNotes}
            </div>
          )}
        </div>
      </div>

      <!-- DELETE CONFIRMATION MODAL -->
      {showDeleteModal && (
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95">
            <h3 class="text-lg font-bold text-white">{dict.confirmDeleteTitle}</h3>
            <p class="text-xs md:text-sm text-slate-400">{dict.confirmDeleteText}</p>
            <div class="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                class="bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs"
              >
                {dict.cancel}
              </button>
              <button
                onClick={handleDeleteConfirm}
                class="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-xl text-xs"
              >
                {dict.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
