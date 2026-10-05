export const READING_STATUSES = ['want_to_read', 'reading', 'completed'] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

/** Shared catalogue entry. Identity (`id`) is the stable book_id from the catalogue sheet. */
export interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  publicationYear?: number;
  /** Free text from the sheet; "English" and "Bahasa Melayu" are the labels the UI translates. */
  language: string;
  category: string;
}

/** One user's relationship with a catalogue book. */
export interface UserBook {
  bookId: string;
  status: ReadingStatus;
  /** 0–100 */
  progress: number;
  /** 1–5, undefined = not rated */
  rating?: number;
  notes: string;
  tags: string[];
  /** ISO timestamp the user added the book */
  addedAt: string;
}

/** A catalogue book joined with the signed-in user's state (what the UI lists and edits). */
export type LibraryEntry = Book & Omit<UserBook, 'bookId'>;

/** A library entry plus the user's collections it belongs to. */
export type LibraryBook = LibraryEntry & { collectionIds: string[] };

export type CollectionColor = 'amber' | 'emerald' | 'purple' | 'blue' | 'rose';

export interface Collection {
  id: string;
  name: string;
  description?: string;
  color: CollectionColor;
  /** Ids of books (in the user's library) filed in this collection. */
  bookIds: string[];
}

export interface Me {
  id: string;
  email: string;
  name?: string;
  authMode: 'cloudflare' | 'dev';
  /** Whether members may publish new books to the shared catalogue. */
  canAddBooks: boolean;
  role: 'member' | 'admin';
  status: 'active' | 'disabled';
  /** Which scan-to-autofill options the server offers. */
  features: { isbnLookup: boolean; coverScan: boolean };
}

/** Book details suggested by an ISBN lookup or a cover scan (to review, never saved automatically). */
export interface BookInfo {
  title: string;
  author: string;
  publisher?: string;
  isbn?: string;
  publicationYear?: number;
  /** "English" or "Bahasa Melayu" when known */
  language?: string;
  category?: string;
}

/** A member of the shared library (an owner or a borrower). */
export interface Person {
  id: string;
  name?: string;
  email: string;
}

export interface Loan {
  id: string;
  borrower: Person;
  /** ISO timestamp */
  borrowedAt: string;
  /** YYYY-MM-DD, optional */
  dueAt?: string;
}

/** One physical copy of a catalogue book: who bought it, when, where it lives, and who has it now. */
export interface Copy {
  id: string;
  book: Book;
  owner: Person;
  /** RM. Only present for the owner's own copies. */
  price?: number;
  /** YYYY-MM-DD */
  purchaseDate?: string;
  location?: string;
  createdAt: string;
  /** The active loan, or null when the copy is available. */
  loan: Loan | null;
}

// ------------------------------------------------------------------ administration

export type MemberRole = 'member' | 'admin';
export type MemberStatus = 'active' | 'disabled';

export interface Member {
  id: string;
  name?: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  createdAt: string;
  lastSeenAt: string;
}

export type ServiceStatus = 'healthy' | 'unavailable' | 'not_configured' | 'configured';

export interface ServiceResult {
  key: string;
  configured: boolean;
  status: ServiceStatus;
  /** A short fixed word such as "fixture" or "development"; never a secret. */
  detail?: string;
  latencyMs?: number;
}

export interface SystemStatus {
  services: ServiceResult[];
  environment: { env: string; authMode: string; catalogueSource: string; bookLookup: string; submissions: boolean };
}

export interface AuditEvent {
  id: string;
  actor?: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type CatalogueIssue = 'missing_isbn' | 'possible_duplicate';

export interface AdminBook extends Book {
  hidden: boolean;
  submittedBy?: string;
  readers: number;
  copies: number;
  issues: CatalogueIssue[];
}
