import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

let counter = 0;
/** A unique dev user per call, so tests never share state (and reruns start clean). */
export const uniqueUser = (label: string) => `${label}-${Date.now().toString(36)}-${counter++}@e2e.test`;

export interface Session {
  context: BrowserContext;
  page: Page;
  errors: string[];
  email: string;
}

/** Opens a browser context signed in as `email` through the development authenticator (dev_user cookie). */
export async function signIn(
  browser: Browser,
  email: string,
  opts: { viewport?: { width: number; height: number }; isMobile?: boolean; hasTouch?: boolean } = {},
): Promise<Session> {
  const baseURL = process.env.BASE_URL ?? 'http://localhost:8080';
  const context = await browser.newContext({ baseURL, ...opts });
  await context.addCookies([{ name: 'dev_user', value: encodeURIComponent(email), url: baseURL }]);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`);
  });
  return { context, page, errors, email };
}

/** Asserts the page logged nothing. `allow` lists messages the test provokes on purpose (e.g. an expected 409). */
export const noConsoleErrors = (s: Session, allow: RegExp[] = []) => {
  const unexpected = s.errors.filter((e) => !allow.some((re) => re.test(e)));
  expect(unexpected, unexpected.join('\n')).toEqual([]);
};

/** Opens the catalogue browser, searches for a title, and adds the first match. */
export async function addFromCatalogue(page: Page, title: string) {
  await page.goto('/library/add');
  await page.getByRole('searchbox', { name: 'Search the catalogue' }).fill(title);
  await page.getByRole('button', { name: `Add ${title} to my library` }).click();
  await expect(page.getByText('Added to your library')).toBeVisible();
}
