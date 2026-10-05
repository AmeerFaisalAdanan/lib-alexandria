import { expect, test } from '@playwright/test';
import { addFromCatalogue, noConsoleErrors, signIn, uniqueUser } from './helpers';

const TITLE = 'Bidayah Al-Hidayah';

test('core flow: browse catalogue → add → track → collect → everything persists', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('ada'));
  const { page } = s;

  // Empty dashboard invites the user to the catalogue.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your library is empty.' })).toBeVisible();
  await page.getByRole('link', { name: 'Browse catalogue' }).click();
  await expect(page).toHaveURL(/\/library\/add$/);
  await expect(page.getByText(/\d+ books in the catalogue/)).toBeVisible();

  // Add from the shared catalogue; the row flips to "In your library".
  await addFromCatalogue(page, TITLE);
  await expect(page.getByRole('link', { name: 'In your library' })).toBeVisible();

  // It is in my library as want-to-read.
  await page.goto('/library');
  await expect(page.getByText('1 book found')).toBeVisible();
  await page.getByRole('link', { name: new RegExp(TITLE) }).click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Want to Read' })).toHaveAttribute('aria-pressed', 'true');

  // Status, progress, rating, tag, notes.
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.getByText('Reading status updated')).toBeVisible();
  await page.getByRole('button', { name: '50%', exact: true }).click();
  await page.getByRole('radio', { name: 'Rate 4 out of 5' }).click();
  await page.getByPlaceholder('New tag').fill('Spiritual');
  await page.getByPlaceholder('New tag').press('Enter');
  await expect(page.getByText('#Spiritual')).toBeVisible();
  await page.getByRole('button', { name: 'Edit notes' }).click();
  await page.getByRole('textbox', { name: 'Personal notes' }).fill('Lelong 20 dapat 5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Notes saved')).toBeVisible();

  // Create a collection and file the book in it.
  await page.goto('/collections');
  await page.getByRole('button', { name: 'New Collection' }).click();
  await page.getByLabel('Name *').fill('Ghazali Classics');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ghazali Classics' })).toBeVisible();
  await page.getByRole('link', { name: /Ghazali Classics/ }).click();
  await page.getByRole('button', { name: 'Add books' }).click();
  await page.getByRole('button', { name: `Add ${TITLE} to collection` }).click();
  await expect(page.getByText('Added to Ghazali Classics')).toBeVisible();
  await page.keyboard.press('Escape');

  // Reload: everything came back from the server.
  await page.reload();
  await expect(page.getByRole('link', { name: new RegExp(TITLE) })).toBeVisible();
  await page.goto('/library/' + (await bookIdFromLibrary(page)));
  await expect(page.getByRole('button', { name: 'Reading', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('50%').first()).toBeVisible();
  await expect(page.getByText('#Spiritual')).toBeVisible();
  await expect(page.getByText('Lelong 20 dapat 5')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ghazali Classics' })).toBeVisible();

  // "Log out and back in" = a brand-new browser session for the same identity: still all there.
  await s.context.close();
  const again = await signIn(browser, s.email);
  await again.page.goto('/library');
  await expect(again.page.getByRole('link', { name: new RegExp(TITLE) })).toBeVisible();
  await expect(again.page.getByText(/Reading\s*·\s*50%/)).toBeVisible();
  await again.page.goto('/collections');
  await expect(again.page.getByRole('heading', { name: 'Ghazali Classics' })).toBeVisible();
  await expect(again.page.getByText('1 book', { exact: true })).toBeVisible();

  // Rename and delete the collection; remove the book from the library.
  await again.page.getByRole('link', { name: /Ghazali Classics/ }).click();
  await again.page.getByRole('button', { name: 'Collection actions' }).click();
  await again.page.getByRole('menuitem', { name: 'Rename' }).click();
  await again.page.getByLabel('Name *').fill('Ghazali Shelf');
  await again.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(again.page.getByRole('heading', { name: 'Ghazali Shelf' })).toBeVisible();
  await again.page.getByRole('button', { name: 'Collection actions' }).click();
  await again.page.getByRole('menuitem', { name: 'Delete' }).click();
  await again.page.getByRole('button', { name: 'Delete collection' }).click();
  await expect(again.page).toHaveURL(/\/collections$/);
  await expect(again.page.getByRole('heading', { name: 'No collections yet.' })).toBeVisible();

  await again.page.goto('/library/' + (await bookIdFromLibrary(again.page)));
  await again.page.getByRole('button', { name: 'Remove', exact: true }).click();
  await again.page.getByRole('button', { name: 'Remove book' }).click();
  await expect(again.page).toHaveURL(/\/library$/);
  await expect(again.page.getByRole('heading', { name: 'Your shelves are waiting.' })).toBeVisible();

  noConsoleErrors(s);
  noConsoleErrors(again);
  await again.context.close();
});

test('record a copy I own: price, location and purchase date', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('ada'));
  const { page } = s;
  await addFromCatalogue(page, TITLE);
  await page.goto('/library');
  await page.getByRole('link', { name: new RegExp(TITLE) }).click();

  await page.getByRole('button', { name: 'I own a copy' }).click();
  await page.getByLabel('Location').fill('Study shelf');
  await page.getByLabel('Price (RM)').fill('25.5');
  await page.getByLabel('Purchase date').fill('2025-03-01');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Copy recorded')).toBeVisible();

  // Copies are shared by everyone, so pick out the one I just recorded.
  const row = page.getByTestId('copy-row').filter({ hasText: 'Bought by you' });
  await expect(row).toContainText('Bought by you');
  await expect(row).toContainText('Study shelf');
  await expect(row).toContainText(/RM\s?25\.50/);
  await expect(row.getByText('Available')).toBeVisible();

  // A bad price is rejected in the dialog, not silently saved.
  await row.getByRole('button', { name: 'Copy actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit copy' }).click();
  await page.getByLabel('Price (RM)').fill('abc');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Enter a positive amount.')).toBeVisible();
  await page.getByLabel('Price (RM)').fill('30');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row).toContainText(/RM\s?30\.00/);

  // The reading-record edit form no longer has purchase fields; it edits reading state only.
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Price (RM)')).toHaveCount(0);
  await expect(page.getByLabel('Notes')).toBeVisible();

  // Dashboard "My Spend" now reflects the copies I own.
  await page.goto('/');
  await expect(page.getByText(/RM\s?30\.00/).first()).toBeVisible();
  noConsoleErrors(s);
  await s.context.close();
});

async function bookIdFromLibrary(page: import('@playwright/test').Page) {
  await page.goto('/library');
  const href = await page.getByRole('link', { name: new RegExp(TITLE) }).first().getAttribute('href');
  return href!.replace('/library/', '');
}
