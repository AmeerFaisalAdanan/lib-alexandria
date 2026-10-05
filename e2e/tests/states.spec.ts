import { expect, test } from '@playwright/test';
import { addFromCatalogue, signIn, uniqueUser } from './helpers';

const TITLE = 'Bidayah Al-Hidayah';

test('network failure shows a retryable error, and retry recovers', async ({ browser }) => {
  const { page, context } = await signIn(browser, uniqueUser('net'));
  await page.route('**/api/**', (r) => r.abort('connectionrefused'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Cannot reach the server' })).toBeVisible();

  await page.unroute('**/api/**');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await context.close();
});

test('expired session (401) asks the user to sign in again', async ({ browser }) => {
  const { page, context } = await signIn(browser, uniqueUser('exp'));
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"code":"unauthorized","message":"authentication required"}}' }),
  );
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Session expired' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in again' })).toBeVisible();
  await context.close();
});

test('server error shows a generic retryable error', async ({ browser }) => {
  const { page, context } = await signIn(browser, uniqueUser('err'));
  await page.route('**/api/my/library', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"internal","message":"internal error"}}' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await context.close();
});

test('catalogue outage does not take down the user’s own library', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('cat'));
  await addFromCatalogue(s.page, TITLE);

  await s.page.route('**/api/books', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"catalogue_unavailable","message":"x"}}' }));
  await s.page.goto('/library');
  await expect(s.page.getByRole('link', { name: new RegExp(TITLE) })).toBeVisible();

  await s.page.goto('/library/add');
  await expect(s.page.getByRole('heading', { name: 'The catalogue is unavailable' })).toBeVisible();

  await s.page.unroute('**/api/books');
  await s.page.getByRole('button', { name: 'Try again' }).click();
  await expect(s.page.getByText(/\d+ books in the catalogue/)).toBeVisible();
  await s.context.close();
});

test('a failed save reverts the change and tells the user', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('fail'));
  await addFromCatalogue(s.page, TITLE);
  await s.page.goto('/library');
  await s.page.getByRole('link', { name: new RegExp(TITLE) }).click();
  await expect(s.page.getByRole('button', { name: 'Want to Read' })).toHaveAttribute('aria-pressed', 'true');

  await s.page.route('**/api/my/library/*', (r, req) =>
    req.method() === 'PATCH' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"internal","message":"x"}}' }) : r.continue(),
  );
  await s.page.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(s.page.getByText('Something went wrong. Please try again.')).toBeVisible();
  // Rolled back to what the server has.
  await expect(s.page.getByRole('button', { name: 'Want to Read' })).toHaveAttribute('aria-pressed', 'true');
  await s.context.close();
});

test('loading shows a skeleton, not a blank page or a spinner overlay', async ({ browser }) => {
  const { page, context } = await signIn(browser, uniqueUser('slow'));
  await page.route('**/api/my/library', async (r) => {
    await new Promise((res) => setTimeout(res, 1200));
    await r.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'Loading' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).first()).toBeAttached(); // shell stays up
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });
  await context.close();
});

test('language switch to Bahasa Melayu covers the UI and survives reload', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('bm'));
  await addFromCatalogue(s.page, TITLE);
  await s.page.goto('/settings');
  await s.page.getByRole('radio', { name: 'Bahasa Melayu' }).click();
  await expect(s.page.getByRole('heading', { name: 'Tetapan' })).toBeVisible();

  await s.page.goto('/library');
  await expect(s.page.getByRole('heading', { name: 'Perpustakaan Saya' })).toBeVisible();
  await s.page.reload();
  await expect(s.page.getByRole('heading', { name: 'Perpustakaan Saya' })).toBeVisible();
  await expect(s.page.getByText('Ingin Dibaca').first()).toBeVisible();
  await expect(s.page.locator('html')).toHaveAttribute('lang', 'ms');

  await s.page.goto('/library/add');
  await expect(s.page.getByRole('heading', { name: 'Tambah Buku' })).toBeVisible();
  await expect(s.page.getByText('buku dalam katalog')).toBeVisible();
  await s.context.close();
});
