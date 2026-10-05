'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n';
import { useLibraryStore } from '@/store/library-store';
import type { Book } from '@/types/library';

export function TagEditor({ book }: { book: Book }) {
  const { t } = useT();
  const addTag = useLibraryStore((s) => s.addTag);
  const removeTag = useLibraryStore((s) => s.removeTag);
  const [draft, setDraft] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    addTag(book.id, draft);
    setDraft('');
  };

  return (
    <div className="space-y-3">
      {book.tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.book.noTags}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {book.tags.map((tag) => (
            <li
              key={tag}
              className="flex items-center gap-1 rounded-full border border-border bg-secondary py-0.5 pr-0.5 pl-3 text-xs font-medium text-secondary-foreground"
            >
              #{tag}
              <button
                type="button"
                onClick={() => removeTag(book.id, tag)}
                aria-label={t.book.removeTag(tag)}
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.book.tagPlaceholder}
          aria-label={t.book.addTag}
          maxLength={32}
          className="h-11 md:h-9"
        />
        <Button type="submit" variant="secondary" className="h-11 md:h-9" disabled={!draft.trim()}>
          <Plus aria-hidden />
          {t.book.addTag}
        </Button>
      </form>
    </div>
  );
}
