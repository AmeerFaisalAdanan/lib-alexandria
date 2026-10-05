'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLibraryStore } from '../../store/useLibraryStore';
import { dictionaries } from '../../i18n/translations';
import { Bookmark, Plus, BookOpen, Trash2 } from 'lucide-react';

export default function CollectionsPage() {
  const collections = useLibraryStore((state) => state.collections);
  const books = useLibraryStore((state) => state.books);
  const addCollection = useLibraryStore((state) => state.addCollection);
  const deleteCollection = useLibraryStore((state) => state.deleteCollection);
  const language = useLibraryStore((state) => state.language);

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addCollection({
      name: name.trim(),
      description: description.trim() || undefined,
    });
    setName('');
    setDescription('');
    setShowAddModal(false);
  };

  return (
    <main class="flex-1 p-4 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
      <div class="flex items-center justify-between border-b border-slate-800/80 pb-5">
        <div>
          <h1 class="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Collections</h1>
          <p class="text-xs md:text-sm text-slate-400 mt-1">Organize books into custom thematic lists</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs md:text-sm shadow-md transition flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>New Collection</span>
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {collections.map((col) => {
          const colBooks = books.filter((b) => b.collectionId === col.id);
          return (
            <div key={col.id} class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition flex flex-col justify-between shadow-lg space-y-4">
              <div class="space-y-2">
                <div class="flex items-start justify-between">
                  <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                    <Bookmark className="w-5 h-5" />
                  </div>
                  <button
                    onClick={() => deleteCollection(col.id)}
                    class="text-slate-500 hover:text-rose-400 p-1 touch-target"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 class="text-lg font-bold text-white leading-snug">{col.name}</h3>
                {col.description && <p class="text-xs text-slate-400">{col.description}</p>}
              </div>

              <!-- Books List preview -->
              <div class="space-y-2 pt-3 border-t border-slate-800/80">
                <div class="flex items-center justify-between text-xs text-slate-400 font-semibold">
                  <span>Included Books</span>
                  <span class="text-amber-400 font-bold">{colBooks.length}</span>
                </div>
                <div class="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {colBooks.length === 0 ? (
                    <span class="text-xs text-slate-500 italic block">No books added to this collection yet.</span>
                  ) : (
                    colBooks.map((b) => (
                      <Link
                        key={b.id}
                        href={`/library/${b.id}`}
                        class="block text-xs font-semibold text-slate-300 hover:text-amber-400 truncate bg-slate-950 p-2 rounded-lg border border-slate-800"
                      >
                        {b.title}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <!-- ADD COLLECTION MODAL -->
      {showAddModal && (
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 class="text-lg font-bold text-white">Create Collection</h3>
            <form onSubmit={handleCreate} class="space-y-4">
              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-300 uppercase">Collection Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Essential Fiqh"
                  class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-300 uppercase">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Brief summary..."
                  class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div class="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  class="bg-slate-800 text-slate-300 font-semibold px-4 py-2.5 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="bg-amber-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
