export type ReadingStatus = 'want_to_read' | 'reading' | 'completed';
export type BookLanguage = 'English' | 'Bahasa Melayu';
export type BookOwner = 'Alep' | 'Taqim';

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
  progress: number; // 0 to 100
  rating?: number; // 1 to 5
  price?: number; // in RM
  purchaseDate?: string;
  notes?: string;
  tags: string[];
  collectionId?: string;
  addedAt: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

export interface Category {
  id: string;
  name: string;
}
