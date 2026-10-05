import { expect, test } from '@playwright/test';
import { addFromCatalogue, noConsoleErrors, signIn, uniqueUser } from './helpers';

const TITLE = 'Bidayah Al-Hidayah';

test('two users: same book, independent state; neither sees the other’s library or collections', async ({ browser }) => {
  const a = await signIn(browser, uniqueUser('alice'));
  const b = await signIn(browser, uniqueUser('bob'));

  // Alice: reading 50%, rated 5, with a collection.
  await addFromCatalogue(a.page, TITLE);
  await a.page.goto('/library');
  await a.page.getByRole('link', { name: new RegExp(TITLE) }).click();
  await a.page.waitForURL(/\/library\/(?!add)[^/]+$/); // the list also has a heading per book: wait for the detail page itself
  await expect(a.page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await a.page.getByRole('button', { name: 'Reading', exact: true }).click();
  await a.page.getByRole('button', { name: '50%', exact: true }).click();
  await a.page.getByRole('radio', { name: 'Rate 5 out of 5' }).click();
  await a.page.goto('/collections');
  await a.page.getByRole('button', { name: 'New Collection' }).click();
  await a.page.getByLabel('Name *').fill('Alice only');
  await a.page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(a.page.getByRole('heading', { name: 'Alice only' })).toBeVisible();

  // Bob: empty library, no collections — nothing of Alice's leaks.
  await b.page.goto('/library');
  await expect(b.page.getByRole('heading', { name: 'Your shelves are waiting.' })).toBeVisible();
  await b.page.goto('/collections');
  await expect(b.page.getByRole('heading', { name: 'No collections yet.' })).toBeVisible();
  await expect(b.page.getByText('Alice only')).toHaveCount(0);

  // Bob adds the same book and finishes it: a separate record.
  await addFromCatalogue(b.page, TITLE);
  await b.page.goto('/library');
  await b.page.getByRole('link', { name: new RegExp(TITLE) }).click();
  await b.page.waitForURL(/\/library\/(?!add)[^/]+$/);
  await expect(b.page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await b.page.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(b.page.getByText('Book completed')).toBeVisible();

  // Alice is still reading at 50%; Bob is completed.
  await a.page.goto('/library');
  await expect(a.page.getByText(/Reading\s*·\s*50%/)).toBeVisible();
  await b.page.goto('/library');
  await expect(b.page.getByText('Completed').first()).toBeVisible();
  await expect(b.page.getByText(/Reading\s*·\s*50%/)).toHaveCount(0);

  // A deep link to a book Bob does not have resolves as "not in your library", never as Alice's data.
  await a.page.goto('/library');
  const href = await a.page.getByRole('link', { name: new RegExp(TITLE) }).first().getAttribute('href');
  await b.page.goto('/library/does-not-exist');
  await expect(b.page.getByRole('heading', { name: 'Book not in your library' })).toBeVisible();
  expect(href).toContain('/library/');
  noConsoleErrors(a);
  noConsoleErrors(b);
  await a.context.close();
  await b.context.close();
});

test('API enforces isolation too (not just the UI)', async ({ browser }) => {
  const a = await signIn(browser, uniqueUser('alice'));
  const b = await signIn(browser, uniqueUser('bob'));
  await addFromCatalogue(a.page, TITLE);
  await b.page.goto('/');
  const ids = await a.page.evaluate(async () => (await (await fetch('/api/my/library')).json()).map((e: { bookId: string }) => e.bookId));

  const bView = await b.page.evaluate(async (id) => {
    await fetch('/api/me'); // provision
    const get = await fetch(`/api/my/library/${id}`);
    const patch = await fetch(`/api/my/library/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"progress":99}' });
    const del = await fetch(`/api/my/library/${id}`, { method: 'DELETE' });
    return [get.status, patch.status, del.status];
  }, ids[0]);
  expect(bView).toEqual([404, 404, 404]);

  // A's entry survived B's attempts.
  const still = await a.page.evaluate(async (id) => (await fetch(`/api/my/library/${id}`)).status, ids[0]);
  expect(still).toBe(200);
  await a.context.close();
  await b.context.close();
});

test('dev user switch in Settings changes who you are', async ({ browser }) => {
  const first = uniqueUser('one');
  const second = uniqueUser('two');
  const s = await signIn(browser, first);
  await s.page.goto('/settings');
  await expect(s.page.getByText(`Signed in as ${first}`)).toBeVisible();
  await expect(s.page.getByRole('heading', { name: 'Development sign-in' })).toBeVisible();

  await s.page.getByLabel('Switch development user (e-mail)').fill(second);
  await s.page.getByRole('button', { name: 'Switch user' }).click();
  await expect(s.page.getByText(`Signed in as ${second}`)).toBeVisible();
  noConsoleErrors(s);
  await s.context.close();
});
