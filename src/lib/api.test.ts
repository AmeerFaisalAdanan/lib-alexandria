import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, entryFromWire } from '@/lib/api';

const respond = (status: number, body?: unknown, raw?: string) =>
  vi.fn().mockImplementation(async () => new Response(raw ?? (body === undefined ? null : JSON.stringify(body)), { status }));

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('sends same-origin JSON requests under /api', async () => {
    const fetchMock = respond(200, { id: 'u1', email: 'a@b.c', authMode: 'dev' });
    vi.stubGlobal('fetch', fetchMock);
    await api.me();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/me');
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' });
  });

  it('never sends a user id: bodies carry only the caller-supplied fields', async () => {
    const fetchMock = respond(200, {
      bookId: 'bk-1', book: { id: 'bk-1', title: 'T', author: 'A', language: 'English', category: 'C' },
      status: 'reading', progress: 10, notes: '', tags: [], collectionIds: [], addedAt: 'x', updatedAt: 'y',
    });
    vi.stubGlobal('fetch', fetchMock);
    await api.updateEntry('bk-1', { progress: 10 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/my/library/bk-1');
    expect(JSON.parse(init.body)).toEqual({ progress: 10 });
  });

  it('encodes ids in paths', async () => {
    const fetchMock = respond(204);
    vi.stubGlobal('fetch', fetchMock);
    await api.removeFromLibrary('a/b c');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/my/library/a%2Fb%20c');
  });

  it('publishes a book and reads the duplicate id from a 409', async () => {
    const fetchMock = respond(409, { error: { code: 'duplicate', message: 'dup', existing: 'bk-7' } });
    vi.stubGlobal('fetch', fetchMock);
    const err = await api.createBook({ title: 'T', author: 'A', language: 'English', category: 'C' }).catch((e) => e);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/books');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(err).toMatchObject({ status: 409, code: 'duplicate', existing: 'bk-7' });
  });

  it('lending endpoints: borrow, lend to someone, return', async () => {
    const fetchMock = respond(200, { id: 'cp1' });
    vi.stubGlobal('fetch', fetchMock);
    await api.lendCopy('cp1', { dueAt: '2026-03-01' });
    await api.lendCopy('cp1', { borrowerId: 'u2' });
    await api.returnCopy('cp1');
    const calls = fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url} ${init.body ?? ''}`);
    expect(calls).toEqual([
      'POST /api/copies/cp1/loan {"dueAt":"2026-03-01"}',
      'POST /api/copies/cp1/loan {"borrowerId":"u2"}',
      'DELETE /api/copies/cp1/loan ',
    ]);
  });

  it('looks an ISBN up and reads a cover photo (raw image body, its own content type)', async () => {
    const info = { title: 'Clean Code', author: 'Robert C. Martin' };
    const fetchMock = respond(200, info);
    vi.stubGlobal('fetch', fetchMock);
    expect(await api.lookupIsbn('9780132350884')).toEqual(info);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/lookup/isbn/9780132350884');

    const photo = new Blob(['jpeg bytes'], { type: 'image/jpeg' });
    await api.readCover(photo);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/lookup/cover');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('image/jpeg');
    expect(init.body).toBe(photo); // sent as is, not JSON-encoded
  });

  it('reports a miss and an unreadable cover as typed errors', async () => {
    vi.stubGlobal('fetch', respond(404, { error: { code: 'not_found', message: 'none' } }));
    expect(await api.lookupIsbn('9780306406157').catch((e) => e)).toMatchObject({ status: 404, code: 'not_found' });
    vi.stubGlobal('fetch', respond(422, { error: { code: 'unreadable', message: 'no' } }));
    expect(await api.readCover(new Blob(['x'], { type: 'image/png' })).catch((e) => e)).toMatchObject({ status: 422, code: 'unreadable' });
  });

  it('admin endpoints: members, system, audit, catalogue moderation', async () => {
    const fetchMock = respond(200, []);
    vi.stubGlobal('fetch', fetchMock);
    await api.admin.listMembers();
    await api.admin.updateMember('m1', { role: 'admin' });
    await api.admin.system();
    await api.admin.audit(25);
    await api.admin.catalogue();
    await api.admin.setBookHidden('bk-1', true);
    const calls = fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url} ${init.body ?? ''}`);
    expect(calls).toEqual([
      'GET /api/admin/members ',
      'PATCH /api/admin/members/m1 {"role":"admin"}',
      'GET /api/admin/system ',
      'GET /api/admin/audit?limit=25 ',
      'GET /api/admin/catalogue ',
      'PATCH /api/admin/catalogue/bk-1 {"hidden":true}',
    ]);
  });

  it('never sends who is acting: the admin API takes only the change itself', async () => {
    const fetchMock = respond(200, {});
    vi.stubGlobal('fetch', fetchMock);
    await api.admin.updateMember('m1', { status: 'disabled' });
    expect(Object.keys(JSON.parse(fetchMock.mock.calls[0][1].body))).toEqual(['status']);
  });

  it('recognises a disabled account and a forbidden admin call', async () => {
    vi.stubGlobal('fetch', respond(403, { error: { code: 'account_disabled', message: 'x' } }));
    expect(await api.me().catch((e) => e)).toMatchObject({ isForbidden: true, isDisabled: true });
    vi.stubGlobal('fetch', respond(403, { error: { code: 'forbidden', message: 'x' } }));
    expect(await api.admin.listMembers().catch((e) => e)).toMatchObject({ isForbidden: true, isDisabled: false });
  });

  it('maps API errors', async () => {
    vi.stubGlobal('fetch', respond(400, { error: { code: 'invalid_request', message: 'rating: must be from 1 to 5', field: 'rating' } }));
    const err = await api.updateEntry('b', { rating: 9 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'invalid_request', field: 'rating' });
  });

  it('flags 401 and 403', async () => {
    vi.stubGlobal('fetch', respond(401, { error: { code: 'unauthorized', message: 'authentication required' } }));
    expect(await api.me().catch((e) => e)).toMatchObject({ isUnauthorized: true });
    vi.stubGlobal('fetch', respond(403, { error: { code: 'forbidden', message: 'no' } }));
    expect(await api.me().catch((e) => e)).toMatchObject({ isForbidden: true });
  });

  it('survives a non-JSON error page from a proxy or login redirect', async () => {
    vi.stubGlobal('fetch', respond(502, undefined, '<html>Bad Gateway</html>'));
    expect(await api.listBooks().catch((e) => e)).toMatchObject({ status: 502, code: 'http_502' });
  });

  it('reports network failure as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await api.me().catch((e) => e)).toMatchObject({ status: 0, isNetwork: true });
  });
});

describe('entryFromWire', () => {
  it('flattens the embedded book and uses bookId as the id', () => {
    const entry = entryFromWire({
      bookId: 'bk-9',
      book: { id: 'bk-9', title: 'T', author: 'A', language: 'English', category: 'C' },
      status: 'reading', progress: 30, notes: undefined as unknown as string, tags: undefined as unknown as string[],
      collectionIds: ['c1'], addedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    });
    expect(entry).toMatchObject({ id: 'bk-9', title: 'T', status: 'reading', progress: 30, notes: '', tags: [] });
    expect('collectionIds' in entry).toBe(false);
    expect('bookId' in entry).toBe(false);
  });
});
