import { expect, test } from '@playwright/test';
import { noConsoleErrors, signIn, uniqueUser } from './helpers';

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test('a member publishes a new book; everyone else sees it and can add it', async ({ browser }) => {
  const a = await signIn(browser, uniqueUser('pub'));
  const b = await signIn(browser, uniqueUser('reader'));
  const title = unique('Fiqh as-Sunnah');

  await a.page.goto('/library/add');
  await a.page.getByRole('link', { name: "Can't find it? Add a new book" }).click();
  await expect(a.page.getByRole('heading', { name: 'New Book' })).toBeVisible();
  await a.page.getByLabel('Title *').fill(`  ${title}  `);
  await a.page.getByLabel('Author *').fill('Sayyid Sabiq');
  await a.page.getByLabel('ISBN', { exact: true }).fill('978-967-0000-' + String(Math.floor(Math.random() * 90 + 10)) + '-' + '3');
  await a.page.getByLabel('Publication year').fill('2018');
  await a.page.getByLabel('Publisher').fill('Pustaka');
  await a.page.getByLabel('Category *').fill('Fiqh');
  await a.page.getByRole('button', { name: 'Publish to catalogue' }).click();

  // Published, and (by default) added to the publisher's library: lands on its detail page.
  await expect(a.page.getByText('Published to the catalogue')).toBeVisible();
  await expect(a.page).toHaveURL(/\/library\/bk-[a-z0-9]{12}$/);
  await expect(a.page.getByRole('heading', { name: title })).toBeVisible();
  const id = a.page.url().split('/').pop()!;

  // Another member sees it in the catalogue straight away and adds it.
  await b.page.goto('/library/add');
  await b.page.getByRole('searchbox', { name: 'Search the catalogue' }).fill(title);
  await expect(b.page.getByText(title)).toBeVisible();
  await b.page.getByRole('button', { name: `Add ${title} to my library` }).click();
  await expect(b.page.getByText('Added to your library')).toBeVisible();
  await b.page.goto('/library/' + id);
  await expect(b.page.getByRole('heading', { name: title })).toBeVisible();

  noConsoleErrors(a);
  noConsoleErrors(b);
  await a.context.close();
  await b.context.close();
});

test('publishing a duplicate is refused and offers the existing book', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('dup'));
  await s.page.goto('/library/add/new');
  // "Bidayah Al-Hidayah" by Imam Al-Ghazali is in the catalogue already (case and spacing do not matter).
  await s.page.getByLabel('Title *').fill('  bidayah   AL-hidayah ');
  await s.page.getByLabel('Author *').fill('imam al-ghazali');
  await s.page.getByLabel('Category *').fill('Kitab Turath');
  await s.page.getByRole('button', { name: 'Publish to catalogue' }).click();

  await expect(s.page.getByText('This book is already in the catalogue')).toBeVisible();
  await s.page.getByRole('button', { name: 'Add the existing book to my library' }).click();
  await expect(s.page).toHaveURL(/\/library\/fx-0001$/);
  await expect(s.page.getByRole('heading', { name: 'Bidayah Al-Hidayah' })).toBeVisible();

  await s.page.goto('/library/add');
  await s.page.getByRole('searchbox', { name: 'Search the catalogue' }).fill('Bidayah');
  await expect(s.page.getByText('1 book in the catalogue')).toBeVisible(); // nothing was duplicated
  noConsoleErrors(s, [/status of 409/]); // the refused duplicate is a deliberate 409
  await s.context.close();
});

test('the form validates, and "no results" offers to add the searched title', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('val'));
  await s.page.goto('/library/add/new');
  await s.page.getByRole('button', { name: 'Publish to catalogue' }).click();
  await expect(s.page.getByText('Title is required.')).toBeVisible();
  await expect(s.page.getByText('Author is required.')).toBeVisible();
  await expect(s.page.getByText('Category is required.')).toBeVisible();

  await s.page.getByLabel('ISBN', { exact: true }).fill('123');
  await s.page.getByLabel('Publication year').fill('99');
  await s.page.getByLabel('Title *').click();
  await expect(s.page.getByText('ISBN should be 10 or 13 digits.')).toBeVisible();
  await expect(s.page.getByText('Enter a year between 1000 and next year.')).toBeVisible();

  const missing = unique('zzqx nothing matches');
  await s.page.goto('/library/add');
  await s.page.getByRole('searchbox', { name: 'Search the catalogue' }).fill(missing);
  await s.page.getByRole('link', { name: 'Add it to the catalogue' }).click();
  await expect(s.page.getByLabel('Title *')).toHaveValue(missing);
  noConsoleErrors(s);
  await s.context.close();
});

test('API: a book with a formula-like title is stored as plain text and invalid input is rejected', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('api'));
  await s.page.goto('/');
  const post = (body: unknown) =>
    s.page.evaluate(async (b) => {
      const r = await fetch('/api/books', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      return { status: r.status, body: await r.json() };
    }, body);

  const title = unique('=HYPERLINK("http://evil.example","x")');
  const ok = await post({ title, author: 'A', language: 'English', category: 'Test' });
  expect(ok.status).toBe(201);
  expect(ok.body.title).toBe(title); // returned verbatim; the Sheets adapter writes it RAW
  expect((await post({ title: 'x', author: 'y', language: 'English', category: 'Test', id: 'bk-hijack' })).status).toBe(400);
  expect((await post({ title: '', author: 'y', language: 'English', category: 'Test' })).status).toBe(400);
  await s.context.close();
});
