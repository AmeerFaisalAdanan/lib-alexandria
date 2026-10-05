import { expect, test, type Page } from '@playwright/test';
import { noConsoleErrors, signIn, uniqueUser, type Session } from './helpers';

// All admin tests live in one serial file: they change roles, and "the last administrator" is a property of the whole
// database, so they must not interleave with each other. Other specs never touch roles.
test.describe.configure({ mode: 'serial' });

// ADMIN_EMAILS=admin@example.test is set for the dev stack (docker-compose / .env). The first time this identity logs in
// while the database has no active administrator, it becomes one.
const ADMIN = 'admin@example.test';

const api = (page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(
    async ([m, p, b]) => {
      const res = await fetch(p as string, { method: m as string, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {}
      return { status: res.status, json };
    },
    [method, path, body] as const,
  );

async function adminSession(browser: Parameters<typeof signIn>[0], opts: Parameters<typeof signIn>[2] = {}) {
  const s = await signIn(browser, ADMIN, opts);
  await s.page.goto('/settings');
  const me = await api(s.page, 'GET', '/api/me');
  expect((me.json as { role: string }).role, 'admin@example.test must be an active administrator (see ADMIN_EMAILS)').toBe('admin');
  return s;
}

const memberCard = (page: Page, email: string) => page.locator(`[data-testid="member-card"][data-email="${email}"]`);

async function chooseAction(page: Page, email: string, action: string) {
  await memberCard(page, email).getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

test('an administrator opens Settings → Administration → Members and changes a member', async ({ browser }) => {
  const member = await signIn(browser, uniqueUser('mem'));
  await member.page.goto('/');
  const admin = await adminSession(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const { page } = admin;

  await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();
  await page.getByRole('link', { name: /^Members/ }).click();
  await expect(page).toHaveURL(/\/settings\/members$/);
  const card = memberCard(page, member.email);
  await expect(card).toContainText('Member');
  await expect(card).toContainText('Active');

  // Promote (with confirmation), and the member really is an administrator on the server.
  await chooseAction(page, member.email, 'Make administrator');
  await expect(page.getByRole('alertdialog')).toContainText('Make this member an administrator?');
  await page.getByRole('button', { name: 'Make administrator' }).click();
  await expect(page.getByText('Member is now an administrator')).toBeVisible();
  await expect(card).toContainText('Administrator');
  expect((await api(member.page, 'GET', '/api/admin/members')).status).toBe(200);

  // Demote.
  await chooseAction(page, member.email, 'Make member');
  await page.getByRole('button', { name: 'Remove access' }).click();
  await expect(page.getByText('Administrator access removed')).toBeVisible();
  await expect(card).not.toContainText('Administrator');
  expect((await api(member.page, 'GET', '/api/admin/members')).status).toBe(403);

  // Disable: the member is locked out at once and stays locked out after "logging in again".
  await chooseAction(page, member.email, 'Disable account');
  await expect(page.getByRole('alertdialog')).toContainText('Disable this account?');
  await page.getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(page.getByText('Account disabled', { exact: true })).toBeVisible();
  await expect(card).toContainText('Disabled');
  const blocked = await api(member.page, 'GET', '/api/books');
  expect(blocked.status).toBe(403);
  expect((blocked.json as { error: { code: string } }).error.code).toBe('account_disabled');
  await member.page.goto('/library');
  await expect(member.page.getByRole('heading', { name: 'Account disabled' })).toBeVisible();
  const again = await signIn(browser, member.email); // a brand-new session for the same identity
  await again.page.goto('/');
  await expect(again.page.getByRole('heading', { name: 'Account disabled' })).toBeVisible();

  // Re-enable restores access.
  await chooseAction(page, member.email, 'Re-enable account');
  await expect(page.getByText('Account re-enabled')).toBeVisible();
  await expect(card).toContainText('Active');
  await again.page.goto('/');
  await expect(again.page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // Everything above is in the audit trail, with the administrator as the actor.
  await page.goto('/settings/system');
  const rows = page.getByTestId('audit-row').filter({ hasText: member.email });
  for (const action of ['member.promoted', 'member.demoted', 'member.disabled', 'member.enabled']) {
    await expect(rows.and(page.locator(`[data-action="${action}"]`))).toHaveCount(1);
  }
  await expect(rows.first()).toContainText(`by ${ADMIN}`);

  noConsoleErrors(admin, [/status of 40[39]/]);
  noConsoleErrors(member, [/status of 40[39]/]);
  for (const s of [admin, member, again]) await s.context.close();
});

test('a normal member sees no administration, and direct URLs and API calls are rejected', async ({ browser }) => {
  const m = await signIn(browser, uniqueUser('plain'), { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.page.goto('/settings');
  await expect(m.page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(m.page.getByRole('heading', { name: 'Administration' })).toHaveCount(0);
  await expect(m.page.getByRole('link', { name: /^Members/ })).toHaveCount(0);
  await expect(m.page.getByRole('link', { name: /^System/ })).toHaveCount(0);

  for (const path of ['/settings/members', '/settings/catalogue', '/settings/system']) {
    await m.page.goto(path);
    await expect(m.page.getByRole('heading', { name: 'Administrators only' })).toBeVisible();
    await expect(m.page.getByTestId('member-card')).toHaveCount(0);
  }

  // The server refuses them regardless of what the page shows.
  const me = (await api(m.page, 'GET', '/api/me')).json as { id: string };
  for (const [method, path] of [['GET', '/api/admin/members'], ['GET', '/api/admin/system'], ['GET', '/api/admin/audit'], ['GET', '/api/admin/catalogue']] as const) {
    expect((await api(m.page, method, path)).status, `${method} ${path}`).toBe(403);
  }
  expect((await api(m.page, 'PATCH', `/api/admin/members/${me.id}`, { role: 'admin' })).status).toBe(403);
  expect((await api(m.page, 'PATCH', '/api/admin/catalogue/fx-0001', { hidden: true })).status).toBe(403);
  // Self-promotion is impossible: the role did not change.
  expect(((await api(m.page, 'GET', '/api/me')).json as { role: string }).role).toBe('member');

  noConsoleErrors(m, [/status of 403/]);
  await m.context.close();
});

test('the last active administrator cannot be demoted or disabled', async ({ browser }) => {
  const admin = await adminSession(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const { page } = admin;

  // Make this the only active administrator (earlier runs may have left others).
  const members = (await api(page, 'GET', '/api/admin/members')).json as { id: string; email: string; role: string; status: string }[];
  for (const other of members.filter((x) => x.role === 'admin' && x.status === 'active' && x.email !== ADMIN)) {
    expect((await api(page, 'PATCH', `/api/admin/members/${other.id}`, { role: 'member' })).status).toBe(200);
  }

  await page.goto('/settings/members');
  await chooseAction(page, ADMIN, 'Make member');
  await expect(page.getByRole('alertdialog')).toContainText('You will lose administrator access immediately');
  await page.getByRole('button', { name: 'Remove access' }).click();
  await expect(page.getByText('There must always be at least one active administrator').first()).toBeVisible();
  await expect(memberCard(page, ADMIN)).toContainText('Administrator');

  await chooseAction(page, ADMIN, 'Disable account');
  await page.getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(page.getByText('There must always be at least one active administrator').first()).toBeVisible();
  await expect(memberCard(page, ADMIN)).toContainText('Active');

  // The same rule holds at the API, and the administrator is still an administrator.
  const self = members.find((x) => x.email === ADMIN)!;
  for (const body of [{ role: 'member' }, { status: 'disabled' }]) {
    const res = await api(page, 'PATCH', `/api/admin/members/${self.id}`, body);
    expect(res.status).toBe(409);
    expect((res.json as { error: { code: string } }).error.code).toBe('last_admin');
  }
  expect(((await api(page, 'GET', '/api/me')).json as { role: string }).role).toBe('admin');
  noConsoleErrors(admin, [/status of 409/]);
  await admin.context.close();
});

test('System shows safe status only: no secrets, honest "not configured"', async ({ browser }) => {
  const admin = await adminSession(browser);
  const { page } = admin;
  await page.goto('/settings');
  await page.getByRole('link', { name: /^System/ }).click();
  await expect(page.getByRole('heading', { name: 'System' })).toBeVisible();

  const row = (key: string) => page.locator(`[data-testid="service-row"][data-service="${key}"]`);
  await expect(row('postgres')).toHaveAttribute('data-status', 'healthy');
  await expect(row('catalogue')).toHaveAttribute('data-status', 'healthy');
  // The dev stack has no Google, Cloudflare or Anthropic credentials, and the page says so instead of pretending.
  await expect(row('googleSheets')).toHaveAttribute('data-status', 'not_configured');
  await expect(row('cloudflareAccess')).toHaveAttribute('data-status', 'not_configured');
  await expect(row('googleBooks')).toHaveAttribute('data-status', 'not_configured');
  await expect(row('cloudflareAccess')).toContainText('Development sign-in');
  await expect(page.getByRole('heading', { name: 'Configuration' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Service Status' })).toBeVisible();

  // Nothing that looks like a credential is on the page or in the API response.
  const raw = await api(page, 'GET', '/api/admin/system');
  const body = JSON.stringify(raw.json);
  expect(body).not.toMatch(/sk-[a-z]|AIza|BEGIN PRIVATE|postgres:\/\/|password|secret|bearer|apikey|api_key/i);
  const pageText = await page.locator('main').innerText();
  expect(pageText).not.toMatch(/sk-[a-z]|AIza|BEGIN PRIVATE|postgres:\/\/|password=|secret|bearer/i);

  // Refresh re-checks the services.
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(row('postgres')).toHaveAttribute('data-status', 'healthy');
  noConsoleErrors(admin);
  await admin.context.close();
});

test('catalogue administration: find issues, hide a book from members, show it again', async ({ browser }) => {
  const author = await signIn(browser, uniqueUser('author'));
  const reader = await signIn(browser, uniqueUser('reader'));
  const admin = await adminSession(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const title = `Moderation test ${Date.now().toString(36)}`;

  // A member publishes a book without an ISBN.
  await author.page.goto('/');
  const created = await api(author.page, 'POST', '/api/books', { title, author: 'Some Author', language: 'English', category: 'Test' });
  expect(created.status).toBe(201);
  const id = (created.json as { id: string }).id;

  const { page } = admin;
  await page.goto('/settings/catalogue');
  await page.getByRole('searchbox', { name: 'Search the catalogue' }).fill(title);
  const row = page.locator(`[data-testid="catalogue-row"][data-book="${id}"]`);
  await expect(row).toContainText('No ISBN');
  await expect(row).toContainText(`Published by ${author.email}`);
  await page.getByRole('searchbox', { name: 'Search the catalogue' }).fill('');
  await page.getByRole('button', { name: /^Issues/ }).click();
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: /^All/ }).click();
  await page.getByRole('searchbox', { name: 'Search the catalogue' }).fill(title);

  const memberSees = async () => {
    await reader.page.goto('/library/add');
    await reader.page.getByRole('searchbox', { name: 'Search the catalogue' }).fill(title);
    return reader.page.getByText(title).count();
  };
  await expect.poll(memberSees).toBeGreaterThan(0);

  // Hide it: it disappears for members at once, and existing data is not touched.
  await row.getByRole('button', { name: /^Catalogue:/ }).click();
  await page.getByRole('menuitem', { name: 'Hide from members' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('can be shown again'.replace('can be shown again', 'You can show it again at any time'));
  await page.getByRole('button', { name: 'Hide book' }).click();
  await expect(page.getByText('Book hidden from members')).toBeVisible();
  await expect(row).toContainText('Hidden');
  await expect.poll(memberSees).toBe(0);
  expect((await api(reader.page, 'GET', `/api/books/${id}`)).status).toBe(404);
  expect((await api(reader.page, 'POST', '/api/my/library', { bookId: id })).status).toBe(404);

  // Show it again.
  await row.getByRole('button', { name: /^Catalogue:/ }).click();
  await page.getByRole('menuitem', { name: 'Show to members' }).click();
  await expect(page.getByText('Book is visible again')).toBeVisible();
  await expect.poll(memberSees).toBeGreaterThan(0);
  expect((await api(reader.page, 'POST', '/api/my/library', { bookId: id })).status).toBe(201);

  await page.goto('/settings/system');
  await expect(page.locator('[data-testid="audit-row"][data-action="catalogue.hidden"]').filter({ hasText: title }).first()).toBeVisible();
  noConsoleErrors(admin, [/status of 404/]);
  for (const s of [author, reader, admin]) await s.context.close();
});

for (const vp of [
  { w: 360, h: 800 },
  { w: 375, h: 812 },
  { w: 390, h: 844 },
  { w: 412, h: 915 },
]) {
  test(`admin screens are mobile-safe @ ${vp.w}px: no overflow, 44px targets, working menus and dialogs`, async ({ browser }) => {
    const s: Session = await adminSession(browser, { viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true });
    const { page } = s;

    const checkLayout = async (route: string) => {
      await page.goto(route);
      await expect(page.getByRole('main')).toBeVisible(); // strict: there must be exactly one <main>, also while loading
      await page.waitForLoadState('networkidle');
      expect(await page.locator('main').count(), `<main> landmarks on ${route}`).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `overflow on ${route}`).toBeLessThanOrEqual(0);

      // Everything tappable inside the page content is at least 44px high.
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('main a[href], main button, main [role=menuitem], main [role=radio]')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[aria-hidden=true]');
          })
          .map((el) => ({ h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40) }))
          .filter((x) => x.h < 44),
      );
      expect(small, `tap targets under 44px on ${route}: ${JSON.stringify(small)}`).toEqual([]);
      // Nothing is clipped off the right edge.
      const clipped = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed').length);
      expect(clipped, `elements past the right edge on ${route}`).toBe(0);
    };

    for (const route of ['/settings', '/settings/members', '/settings/catalogue', '/settings/system']) await checkLayout(route);

    // Members: the action menu and the confirm dialog work, and fit on screen.
    await page.goto('/settings/members');
    await expect(page.getByTestId('member-card').first()).toBeVisible();
    const target = page.getByTestId('member-card').filter({ hasText: 'Member' }).filter({ hasText: 'Active' }).first();
    await target.getByRole('button', { name: /^Actions for/ }).click();
    const items = page.getByRole('menuitem');
    for (const item of await items.all()) {
      const box = (await item.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.w);
    }
    await page.getByRole('menuitem', { name: 'Make administrator' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    for (const b of await dialog.getByRole('button').all()) {
      const box = (await b.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.w);
    }
    await dialog.getByRole('button', { name: 'Cancel' }).click(); // nothing changes
    await expect(dialog).toBeHidden();

    // The existing navigation is untouched: five tabs with Home in the centre, Settings in the header.
    const bar = page.getByRole('navigation', { name: 'Main navigation' }).last();
    expect((await bar.getByRole('link').allInnerTexts()).map((l) => l.trim())).toEqual(['Library', 'Collections', 'Home', 'Lending', 'Add']);
    await expect(page.getByRole('banner').getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');

    noConsoleErrors(s);
    await s.context.close();
  });
}

test('administration is translated: Bahasa Melayu', async ({ browser }) => {
  const s = await adminSession(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await s.page.getByRole('radio', { name: 'Bahasa Melayu' }).click();
  await expect(s.page.getByRole('heading', { name: 'Pentadbiran' })).toBeVisible();
  await s.page.getByRole('link', { name: /^Ahli/ }).click();
  await expect(s.page.getByRole('heading', { name: 'Ahli' })).toBeVisible();
  await expect(s.page.getByText('Pentadbir').first()).toBeVisible();
  await expect(s.page.getByText('Aktif').first()).toBeVisible();
  await s.page.goto('/settings/system');
  await expect(s.page.getByRole('heading', { name: 'Sistem' })).toBeVisible();
  await expect(s.page.getByRole('heading', { name: 'Status Perkhidmatan' })).toBeVisible();
  await expect(s.page.getByRole('heading', { name: 'Konfigurasi' })).toBeVisible();
  await expect(s.page.getByRole('heading', { name: 'Jejak audit' })).toBeVisible();
  await expect(s.page.getByText('Belum dikonfigurasi').first()).toBeVisible();
  await s.page.goto('/settings/catalogue');
  await expect(s.page.getByRole('heading', { name: 'Katalog' })).toBeVisible();
  await s.page.goto('/settings');
  await s.page.getByRole('radio', { name: 'English' }).click();
  await s.context.close();
});
