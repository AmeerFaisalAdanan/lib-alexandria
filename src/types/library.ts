export const READING_STATUSES = ['want_to_read', 'reading', 'completed'] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

export const BOOK_LANGUAGES = ['English', 'Bahasa Melayu'] as const;
export type BookLanguage = (typeof BOOK_LANGUAGES)[number];

export const OWNERS = ['Alep', 'Taqim'] as const;
export type BookOwner = (typeof OWNERS)[number];

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  publicationYear?: number;
  language: BookLanguage;
  category: string;
  owner: BookOwner;
  location: string;
  status: ReadingStatus;
  /** 0–100 */
  progress: number;
  /** 1–5, undefined = not rated */
  rating?: number;
  /** RM */
  price?: number;
  /** YYYY-MM-DD */
  purchaseDate?: string;
  notes?: string;
  tags: string[];
  collectionIds: string[];
  /** ISO timestamp */
  addedAt: string;
}

export type CollectionColor = 'amber' | 'emerald' | 'purple' | 'blue' | 'rose';

export interface Collection {
  id: string;
  name: string;
  description?: string;
  color: CollectionColor;
}

export interface Category {
  id: string;
  name: string;
}
