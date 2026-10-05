import type { Book, BookInfo, Collection, CollectionColor, Copy, LibraryEntry, Me, Person, ReadingStatus, UserBook } from '@/types/library';
import type { EntryPatch } from '@/lib/library';

/** A failed API call. status 0 means the request never reached the server. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
    /** For a rejected duplicate: the id of the catalogue book it collides with. */
    public existing?: string,
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  // A Blob (e.g. a cover photo) is sent as is, with its own type; everything else is JSON.
  const raw = typeof Blob !== 'undefined' && body instanceof Blob;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': raw ? (body as Blob).type : 'application/json' },
      body: body === undefined ? undefined : raw ? (body as Blob) : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'network', 'Network request failed');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    // A non-JSON body on an error is an upstream/proxy page (e.g. an Access login redirect, or Cloudflare's own page replacing a 502). The API reports temporary upstream outages as 503 for exactly that reason.
    json = undefined;
  }
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string; field?: string; existing?: string } } | undefined)?.error;
    throw new ApiError(res.status, e?.code ?? `http_${res.status}`, e?.message ?? res.statusText, e?.field, e?.existing);
  }
  return json as T;
}

// ------------------------------------------------------------------ wire types

/** One element of GET /api/my/library: the user's state plus the embedded catalogue book. */
export interface WireEntry extends UserBook {
  book: Book;
  collectionIds: string[];
  updatedAt: string;
}

interface WireCollection {
  id: string;
  name: string;
  description?: string;
  color: CollectionColor;
  bookIds: string[];
}

export function entryFromWire(w: WireEntry): LibraryEntry {
  return {
    ...w.book,
    id: w.bookId,
    status: w.status,
    progress: w.progress,
    rating: w.rating,
    notes: w.notes ?? '',
    tags: w.tags ?? [],
    addedAt: w.addedAt,
  };
}

const collectionFromWire = (c: WireCollection): Collection => ({
  id: c.id,
  name: c.name,
  description: c.description,
  color: c.color,
  bookIds: c.bookIds ?? [],
});

export interface NewBookInput {
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  publicationYear?: number;
  language: string;
  category: string;
}

export interface CopyInput {
  price?: number | null;
  purchaseDate?: string | null;
  location?: string | null;
}

export interface CollectionInput {
  name: string;
  description?: string;
  color: CollectionColor;
}

// ------------------------------------------------------------------ endpoints

export const api = {
  me: () => request<Me>('GET', '/me'),

  listBooks: () => request<Book[]>('GET', '/books'),

  /** Publish a new book to the shared catalogue (visible to every member). */
  createBook: (input: NewBookInput) => request<Book>('POST', '/books', input),

  /** Suggest book details for an ISBN. 404 `not_found` means nobody knows it. */
  lookupIsbn: (isbn: string) => request<BookInfo>('GET', `/lookup/isbn/${encodeURIComponent(isbn)}`),
  /** Read a photo of a book cover (JPEG/PNG/WebP, up to 5 MB). 422 `unreadable` when no book is recognised. */
  readCover: (image: Blob) => request<BookInfo>('POST', '/lookup/cover', image),

  listUsers: () => request<Person[]>('GET', '/users'),

  listCopies: () => request<Copy[]>('GET', '/copies'),
  createCopy: (bookId: string, input: CopyInput = {}) => request<Copy>('POST', '/copies', { bookId, ...input }),
  updateCopy: (id: string, patch: CopyInput) => request<Copy>('PATCH', `/copies/${id}`, patch),
  deleteCopy: (id: string) => request<void>('DELETE', `/copies/${id}`),
  /** Borrow for yourself, or (owner only) lend to `borrowerId`. */
  lendCopy: (id: string, opts: { borrowerId?: string; dueAt?: string } = {}) => request<Copy>('POST', `/copies/${id}/loan`, opts),
  returnCopy: (id: string) => request<Copy>('DELETE', `/copies/${id}/loan`),

  listLibrary: async () => (await request<WireEntry[]>('GET', '/my/library')).map(entryFromWire),
  addToLibrary: async (bookId: string, initial?: { status?: ReadingStatus }) =>
    entryFromWire(await request<WireEntry>('POST', '/my/library', { bookId, ...initial })),
  updateEntry: async (bookId: string, patch: EntryPatch) =>
    entryFromWire(await request<WireEntry>('PATCH', `/my/library/${encodeURIComponent(bookId)}`, patch)),
  removeFromLibrary: (bookId: string) => request<void>('DELETE', `/my/library/${encodeURIComponent(bookId)}`),

  listCollections: async () => (await request<WireCollection[]>('GET', '/collections')).map(collectionFromWire),
  createCollection: async (input: CollectionInput) =>
    collectionFromWire(await request<WireCollection>('POST', '/collections', input)),
  updateCollection: async (id: string, patch: Partial<Omit<CollectionInput, 'description'>> & { description?: string | null }) =>
    collectionFromWire(await request<WireCollection>('PATCH', `/collections/${id}`, patch)),
  deleteCollection: (id: string) => request<void>('DELETE', `/collections/${id}`),
  addCollectionBook: async (id: string, bookId: string) =>
    collectionFromWire(await request<WireCollection>('PUT', `/collections/${id}/books/${encodeURIComponent(bookId)}`)),
  removeCollectionBook: async (id: string, bookId: string) =>
    collectionFromWire(await request<WireCollection>('DELETE', `/collections/${id}/books/${encodeURIComponent(bookId)}`)),
};
