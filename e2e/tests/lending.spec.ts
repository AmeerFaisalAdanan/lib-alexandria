import { expect, test } from '@playwright/test';
import { addFromCatalogue, noConsoleErrors, signIn, uniqueUser, type Session } from './helpers';

const TITLE = 'Al-Fiqh Al-Manhaji (Jilid 1)';

/** Adds the book to the owner's library and records a copy they own. Returns the book's detail URL. */
async function ownCopy(s: Session, details: { location?: string; price?: string; date?: string } = {}) {
  await addFromCatalogue(s.page, TITLE);
  await s.page.goto('/library');
  await s.page.getByRole('link', { name: new RegExp(TITLE.replace(/[()]/g, '\\$&')) }).click();
  await s.page.waitForURL(/\/library\/(?!add)[^/]+$/);
  const url = s.page.url();
  await s.page.getByRole('button', { name: 'I own a copy' }).click();
  if (details.location) await s.page.getByLabel('Location').fill(details.location);
  if (details.price) await s.page.getByLabel('Price (RM)').fill(details.price);
  if (details.date) await s.page.getByLabel('Purchase date').fill(details.date);
  await s.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(s.page.getByText('Copy recorded')).toBeVisible();
  return url;
}

test('who bought it, who borrowed it, since when: the whole lending cycle', async ({ browser }) => {
  const owner = await signIn(browser, uniqueUser('owner'));
  const reader = await signIn(browser, uniqueUser('reader'));
  await ownCopy(owner, { location: 'Living room', price: '65', date: '2025-03-01' });

  // The reader (who has not added the book at all) finds the copy on the lending shelf.
  await reader.page.goto('/lending');
  await reader.page.getByRole('button', { name: /^Available/ }).click();
  const available = reader.page.getByTestId('copy-row').filter({ hasText: owner.email });
  await expect(available).toContainText(TITLE);
  await expect(available).toContainText(`Bought by ${owner.email}`);
  await expect(available).toContainText('Living room');
  await expect(available).toContainText('Available');
  await expect(available).not.toContainText('RM'); // price is private to the owner
  await expect(available.getByRole('button', { name: 'Copy actions' })).toHaveCount(0); // and so are edit/remove

  // Borrow it, with a due date.
  await available.getByRole('button', { name: 'Borrow' }).click();
  const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  await reader.page.getByLabel('Due date (optional)').fill(due);
  await reader.page.getByRole('dialog').getByRole('button', { name: 'Borrow' }).click();
  await expect(reader.page.getByText('Borrowed', { exact: true })).toBeVisible();

  await reader.page.getByRole('button', { name: /^Borrowed by me/ }).click();
  const mine = reader.page.getByTestId('copy-row').filter({ hasText: TITLE });
  await expect(mine).toContainText('Borrowed by you');
  await expect(mine).toContainText('since');
  await expect(mine).toContainText('due');
  await expect(mine.getByRole('button', { name: 'Mark returned' })).toBeVisible();

  // The owner sees who has it, and the dashboard summarises it.
  await owner.page.goto('/lending');
  await owner.page.getByRole('button', { name: /^Lent by me/ }).click();
  const lent = owner.page.getByTestId('copy-row').filter({ hasText: reader.email });
  await expect(lent).toContainText(TITLE);
  await expect(lent).toContainText(/RM\s?65\.00/); // the owner sees their own price
  await owner.page.goto('/');
  await expect(owner.page.getByText('1 book of yours on loan')).toBeVisible();

  // Everyone sees it is out; nobody else can borrow it, and a copy on loan cannot be removed.
  await owner.page.goto('/lending');
  const ownerRow = owner.page.getByTestId('copy-row').filter({ hasText: 'Bought by you' }).filter({ hasText: reader.email });
  await expect(ownerRow).toContainText('Borrowed by');
  await ownerRow.getByRole('button', { name: 'Copy actions' }).click();
  await expect(owner.page.getByRole('menuitem', { name: 'This copy is on loan. Mark it returned first.' })).toHaveAttribute('aria-disabled', 'true');
  await owner.page.keyboard.press('Escape');

  // The borrower returns it; it is available again.
  await mine.getByRole('button', { name: 'Mark returned' }).click();
  await expect(reader.page.getByText('Marked as returned')).toBeVisible();
  await reader.page.getByRole('button', { name: /^Available/ }).click();
  await expect(reader.page.getByTestId('copy-row').filter({ hasText: owner.email })).toContainText('Available');

  noConsoleErrors(owner);
  noConsoleErrors(reader);
  await owner.context.close();
  await reader.context.close();
});

test('the owner can lend to a chosen member, and cannot borrow their own copy', async ({ browser }) => {
  const owner = await signIn(browser, uniqueUser('owner'));
  const friend = await signIn(browser, uniqueUser('friend'));
  await friend.page.goto('/'); // make sure the friend exists as a member
  await ownCopy(owner);

  // Copies are shared by everyone; this is the one I own.
  const row = () => owner.page.getByTestId('copy-row').filter({ hasText: 'Bought by you' }).first();
  await expect(row().getByRole('button', { name: 'Borrow' })).toHaveCount(0);
  await row().getByRole('button', { name: 'Lend to…' }).click();
  await owner.page.getByRole('combobox', { name: 'Borrower' }).click();
  await owner.page.getByRole('option', { name: friend.email }).click();
  await owner.page.getByRole('dialog').getByRole('button', { name: 'Lend', exact: true }).click();
  await expect(owner.page.getByText('Lent out')).toBeVisible();
  await expect(row()).toContainText(`Borrowed by ${friend.email}`);

  // The friend sees it as theirs; the owner can also end the loan.
  await friend.page.goto('/lending');
  await friend.page.getByRole('button', { name: /^Borrowed by me/ }).click();
  await expect(friend.page.getByTestId('copy-row').filter({ hasText: owner.email })).toContainText('Borrowed by you');
  await row().getByRole('button', { name: 'Mark returned' }).click();
  await expect(row()).toContainText('Available');

  noConsoleErrors(owner);
  noConsoleErrors(friend);
  await owner.context.close();
  await friend.context.close();
});

test('API enforces who may do what with a copy', async ({ browser }) => {
  const owner = await signIn(browser, uniqueUser('owner'));
  const other = await signIn(browser, uniqueUser('other'));
  const third = await signIn(browser, uniqueUser('third'));
  await ownCopy(owner);
  await other.page.goto('/');
  const thirdId = await third.page.goto('/').then(() => third.page.evaluate(async () => (await (await fetch('/api/me')).json()).id as string));

  const copyId = await owner.page.evaluate(async (email) => {
    const copies = await (await fetch('/api/copies')).json();
    return copies.find((c: { owner: { email: string } }) => c.owner.email === email).id as string;
  }, owner.email);

  const attempts = await other.page.evaluate(
    async ([id, uid]) => {
      const call = async (method: string, path: string, body?: unknown) =>
        (await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).status;
      return {
        edit: await call('PATCH', `/api/copies/${id}`, { location: 'mine now' }),
        remove: await call('DELETE', `/api/copies/${id}`),
        lendForOwner: await call('POST', `/api/copies/${id}/loan`, { borrowerId: uid }),
        returnNothing: await call('DELETE', `/api/copies/${id}/loan`),
      };
    },
    [copyId, thirdId],
  );
  // Editing/removing someone else's copy is forbidden; lending it to a third person is the owner's right alone;
  // returning a loan that doesn't exist is a 404. (Borrowing it for yourself is allowed, and is covered elsewhere.)
  expect(attempts).toEqual({ edit: 403, remove: 403, lendForOwner: 403, returnNothing: 404 });

  await owner.context.close();
  await other.context.close();
  await third.context.close();
});
