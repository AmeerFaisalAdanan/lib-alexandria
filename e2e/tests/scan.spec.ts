import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { noConsoleErrors, signIn, uniqueUser } from './helpers';

const FIX = path.join(__dirname, '..', '.fixtures');

async function expectCleanCode(page: Page) {
  await expect(page.getByLabel('Title *')).toHaveValue(/^Clean Code/);
  await expect(page.getByLabel('Author *')).toHaveValue('Robert C. Martin');
  await expect(page.getByLabel('ISBN', { exact: true })).toHaveValue('9780132350884');
  await expect(page.getByLabel('Publisher')).toHaveValue('Prentice Hall');
  await expect(page.getByLabel('Publication year')).toHaveValue('2008');
  await expect(page.getByLabel('Category *')).toHaveValue('Technology & Software');
  await expect(page.getByRole('status').filter({ hasText: 'Filled in from the scan' })).toBeVisible();
}

test('live camera: scanning a barcode fills the form from the ISBN', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('scan'));
  await s.page.goto('/library/add/new');
  await expect(s.page.getByRole('heading', { name: 'Scan to autofill' })).toBeVisible();

  await s.page.getByRole('button', { name: 'Scan barcode' }).click();
  await expect(s.page.getByRole('dialog').getByText('Scan the barcode').first()).toBeVisible();
  // The fake webcam films the barcode; the dialog closes by itself once it is read.
  await expect(s.page.getByRole('dialog')).toHaveCount(0, { timeout: 20_000 });
  await expectCleanCode(s.page);
  noConsoleErrors(s);
  await s.context.close();
});

test('photo of a barcode fills the form', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('photo'));
  await s.page.goto('/library/add/new');
  await s.page.getByTestId('scan-photo-input').setInputFiles(path.join(FIX, 'barcode-known.png'));
  await expectCleanCode(s.page);
  noConsoleErrors(s);
  await s.context.close();
});

test('photo of a cover (no barcode) is read by the vision model and fills the form', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('cover'));
  await s.page.goto('/library/add/new');
  await s.page.getByTestId('scan-photo-input').setInputFiles(path.join(FIX, 'cover.jpg'));
  await expect(s.page.getByLabel('Title *')).toHaveValue('The Pragmatic Programmer');
  await expect(s.page.getByLabel('Author *')).toHaveValue('Andrew Hunt, David Thomas');
  await expect(s.page.getByLabel('Publisher')).toHaveValue('Addison-Wesley');
  await expect(s.page.getByRole('status').filter({ hasText: 'Filled in from the scan' })).toBeVisible();
  noConsoleErrors(s);
  await s.context.close();
});

test('a valid barcode nobody knows keeps the ISBN and says so, without wiping what was typed', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('unknown'));
  await s.page.goto('/library/add/new');
  await s.page.getByLabel('Title *').fill('My own title');
  await s.page.getByLabel('Category *').fill('Fiqh');
  await s.page.getByTestId('scan-photo-input').setInputFiles(path.join(FIX, 'barcode-unknown.png'));

  await expect(s.page.getByLabel('ISBN', { exact: true })).toHaveValue('9780306406157');
  await expect(s.page.getByRole('status').filter({ hasText: 'no book details were found' })).toBeVisible();
  await expect(s.page.getByLabel('Title *')).toHaveValue('My own title'); // untouched
  await expect(s.page.getByLabel('Category *')).toHaveValue('Fiqh');
  noConsoleErrors(s, [/status of 404/]); // the miss is a deliberate 404
  await s.context.close();
});

test('a lookup outage keeps the scanned ISBN and says the lookup is busy (not "no details found")', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('busy'));
  await s.page.goto('/library/add/new');
  await s.page.route('**/api/lookup/isbn/*', (r) =>
    r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"lookup_unavailable","message":"x"}}' }),
  );
  await s.page.getByTestId('scan-photo-input').setInputFiles(path.join(FIX, 'barcode-known.png'));
  await expect(s.page.getByLabel('ISBN', { exact: true })).toHaveValue('9780132350884');
  await expect(s.page.getByRole('status').filter({ hasText: 'the book lookup is busy' })).toBeVisible();
  await expect(s.page.getByLabel('Title *')).toHaveValue('');
  noConsoleErrors(s, [/status of 503/]);
  await s.context.close();
});

test('scanning never replaces a category the user chose', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('keepcat'));
  await s.page.goto('/library/add/new');
  await s.page.getByLabel('Category *').fill('Fiqh');
  await s.page.getByTestId('scan-photo-input').setInputFiles(path.join(FIX, 'barcode-known.png'));
  await expect(s.page.getByLabel('Title *')).toHaveValue(/^Clean Code/);
  await expect(s.page.getByLabel('Category *')).toHaveValue('Fiqh');
  await s.context.close();
});

test('typing an ISBN and pressing "Look up" fills the form; the button needs a valid ISBN', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('typed'));
  await s.page.goto('/library/add/new');
  const lookup = s.page.getByRole('button', { name: 'Look up this ISBN and fill in the details' });
  await expect(lookup).toBeDisabled();
  await s.page.getByLabel('ISBN', { exact: true }).fill('978-0-13-235088-5'); // wrong check digit
  await expect(lookup).toBeDisabled();
  await s.page.getByLabel('ISBN', { exact: true }).fill('978-0-13-235088-4');
  await expect(lookup).toBeEnabled();
  await lookup.click();
  await expectCleanCode(s.page);
  noConsoleErrors(s);
  await s.context.close();
});

test('without a usable camera the scanner explains why and offers a photo instead', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('nocam'));
  // A plain-HTTP LAN address has no navigator.mediaDevices at all; reproduce that.
  await s.page.addInitScript(() => Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true }));
  await s.page.goto('/library/add/new');
  await s.page.getByRole('button', { name: 'Scan barcode' }).click();
  await expect(s.page.getByRole('dialog').getByRole('alert')).toContainText('camera is not available');

  const chooser = s.page.waitForEvent('filechooser');
  await s.page.getByRole('button', { name: 'Use a photo instead' }).click();
  await (await chooser).setFiles(path.join(FIX, 'barcode-known.png'));
  await expectCleanCode(s.page);
  await s.context.close();
});

test('a photo with no barcode and nothing readable gives a clear message (not a crash)', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('blank'));
  await s.page.goto('/library/add/new');
  // Force the server's answer for the cover reader.
  await s.page.route('**/api/lookup/cover', (r) =>
    r.fulfill({ status: 422, contentType: 'application/json', body: '{"error":{"code":"unreadable","message":"no"}}' }),
  );
  await s.page.getByTestId('scan-photo-input').setInputFiles(path.join(FIX, 'cover.jpg'));
  await expect(s.page.getByRole('alert').filter({ hasText: 'Could not read a book from that photo' })).toBeVisible();
  await expect(s.page.getByLabel('Title *')).toHaveValue('');
  noConsoleErrors(s, [/status of 422/]);
  await s.context.close();
});

test('Bahasa Melayu strings cover the scanner', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('bmscan'));
  await s.page.goto('/settings');
  await s.page.getByRole('radio', { name: 'Bahasa Melayu' }).click();
  await s.page.goto('/library/add/new');
  await expect(s.page.getByRole('heading', { name: 'Imbas untuk isi automatik' })).toBeVisible();
  await expect(s.page.getByRole('button', { name: 'Imbas kod bar' })).toBeVisible();
  await expect(s.page.getByRole('button', { name: 'Imbas kulit buku' })).toBeVisible();
  await s.context.close();
});
