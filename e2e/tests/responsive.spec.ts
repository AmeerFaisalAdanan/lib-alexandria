import { expect, test } from '@playwright/test';
import { addFromCatalogue, noConsoleErrors, signIn, uniqueUser } from './helpers';

const TITLE = 'Bidayah Al-Hidayah';
// The two longest titles in the fixture stand in for "long titles" (80-char case is covered below).
const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800, mobile: true },
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '412x915', width: 412, height: 915, mobile: true },
  { name: '768x1024', width: 768, height: 1024, mobile: false },
  { name: '1280x800', width: 1280, height: 800, mobile: false },
];

for (const vp of VIEWPORTS) {
  test(`no horizontal overflow, no console errors, usable touch targets @ ${vp.name}`, async ({ browser }) => {
    const s = await signIn(browser, uniqueUser('vp'), {
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    const { page } = s;

    await addFromCatalogue(page, TITLE);
    await page.goto('/library');
    await page.getByRole('link', { name: new RegExp(TITLE) }).click();
    await page.waitForURL(/\/library\/(?!add)[^/]+$/);
    const detail = page.url();
    await page.getByRole('button', { name: 'Reading', exact: true }).click();
    await page.goto('/collections');
    await page.getByRole('button', { name: 'New Collection' }).click();
    await page.getByLabel('Name *').fill('Mobile shelf');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Mobile shelf' })).toBeVisible();
    // A recorded copy (owner, location, price) so the lending rows are laid out with real content.
    await page.goto(detail);
    await page.getByRole('button', { name: 'I own a copy' }).click();
    await page.getByLabel('Location').fill('A very long location name that should wrap rather than overflow the card');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Copy recorded')).toBeVisible();
    await page.goto('/collections');
    const collection = await page.getByRole('link', { name: /Mobile shelf/ }).getAttribute('href');

    for (const route of ['/', '/library', '/library/add', '/library/add/new', '/lending', detail, `${detail}/edit`, '/collections', collection!, '/settings']) {
      await page.goto(route.startsWith('http') ? route : route);
      await expect(page.getByRole('main')).toBeVisible();
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(0);

      if (vp.mobile) {
        // Visible tap targets should be at least 36px tall (44px is the design target; 36 allows dense chips).
        const small = await page.evaluate(() =>
          [...document.querySelectorAll('a[href], button, [role=radio], [role=tab]')]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && !el.closest('[aria-hidden=true]');
            })
            .map((el) => ({ h: el.getBoundingClientRect().height, label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40) }))
            .filter((x) => x.h < 36),
        );
        expect(small, `tap targets under 36px on ${route}: ${JSON.stringify(small)}`).toEqual([]);
      }
    }

    if (vp.mobile) {
      // Bottom navigation is visible; the sticky save bar on the edit form clears it.
      await page.goto(`${detail}/edit`);
      await expect(page.getByRole('navigation', { name: 'Main navigation' }).last()).toBeVisible();
      const save = page.getByRole('button', { name: 'Save changes' });
      await expect(save).toBeInViewport();
    }

    noConsoleErrors(s);
    await s.context.close();
  });
}

test('very long text does not break the layout at 360px', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('long'), { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
  const { page } = s;
  await addFromCatalogue(page, TITLE);

  const longTag = 'x'.repeat(32);
  await page.goto('/library');
  await page.getByRole('link', { name: new RegExp(TITLE) }).click();
  await page.getByPlaceholder('New tag').fill(longTag);
  await page.getByPlaceholder('New tag').press('Enter');
  await page.getByRole('button', { name: 'Edit notes' }).click();
  await page.getByRole('textbox', { name: 'Personal notes' }).fill('word '.repeat(300) + 'U'.repeat(200));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Notes saved')).toBeVisible();

  await page.goto('/collections');
  await page.getByRole('button', { name: 'New Collection' }).click();
  await page.getByLabel('Name *').fill('A'.repeat(80));
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForLoadState('networkidle');

  for (const route of ['/library', '/collections', page.url()]) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
  await page.goto('/library');
  await page.getByRole('link', { name: new RegExp(TITLE) }).click();
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  noConsoleErrors(s);
  await s.context.close();
});
