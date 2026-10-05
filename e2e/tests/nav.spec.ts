import { expect, test } from '@playwright/test';
import { noConsoleErrors, signIn, uniqueUser } from './helpers';

for (const vp of [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
]) {
  test(`mobile: Home is the centre tab of the bottom bar @ ${vp.name}`, async ({ browser }) => {
    const s = await signIn(browser, uniqueUser('nav'), { viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true });
    const { page } = s;
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    const bar = page.getByRole('navigation', { name: 'Main navigation' }).last();
    const labels = await bar.getByRole('link').allInnerTexts();
    expect(labels.map((l) => l.trim())).toEqual(['Library', 'Collections', 'Home', 'Lending', 'Add']);

    // Home sits exactly in the middle of the screen, and is the current page.
    const home = bar.getByRole('link', { name: 'Home' });
    await expect(home).toHaveAttribute('aria-current', 'page');
    const box = (await home.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThanOrEqual(1.5);

    // Settings moved to the header (and is at least a 44px target).
    const settings = page.getByRole('banner').getByRole('link', { name: 'Settings' });
    const sb = (await settings.boundingBox())!;
    expect(sb.width).toBeGreaterThanOrEqual(44);
    expect(sb.height).toBeGreaterThanOrEqual(44);
    await settings.click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('banner').getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');

    // The other tabs still go where they say, and Add stays "current" on the nested new-book page.
    await bar.getByRole('link', { name: 'Lending' }).click();
    await expect(page).toHaveURL(/\/lending$/);
    await bar.getByRole('link', { name: 'Add' }).click();
    await page.goto('/library/add/new');
    await expect(bar.getByRole('link', { name: 'Add' })).toHaveAttribute('aria-current', 'page');
    await bar.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);
    noConsoleErrors(s);
    await s.context.close();
  });
}

test('desktop sidebar is unchanged: dashboard first, settings included', async ({ browser }) => {
  const s = await signIn(browser, uniqueUser('desk'), { viewport: { width: 1280, height: 800 } });
  await s.page.goto('/');
  const side = s.page.getByRole('navigation', { name: 'Main navigation' }).first();
  expect((await side.getByRole('link').allInnerTexts()).map((l) => l.trim().replace(/\s+\d+$/, ''))).toEqual([
    'Dashboard', 'Library', 'Add Book', 'Collections', 'Lending', 'Settings',
  ]);
  await expect(s.page.getByRole('banner')).toBeHidden(); // the mobile header is not shown on desktop
  await s.context.close();
});
