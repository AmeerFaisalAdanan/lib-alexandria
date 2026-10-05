import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/en';
import { ms } from '@/i18n/ms';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

describe('errorMessage', () => {
  it.each([
    ['last_admin', 409, 'lastAdmin'],
    ['account_disabled', 403, 'accountDisabled'],
    ['on_loan', 409, 'onLoan'],
    ['rate_limited', 429, 'rateLimited'],
  ] as const)('%s has its own translated message in English and Malay', (code, status, key) => {
    const err = new ApiError(status, code, 'raw server text');
    expect(errorMessage(err, en)).toBe(en.errors[key]);
    expect(errorMessage(err, ms)).toBe(ms.errors[key]);
    expect(errorMessage(err, ms)).not.toBe(errorMessage(err, en));
  });

  it('falls back to a generic message and never shows raw server text for unexpected failures', () => {
    expect(errorMessage(new ApiError(500, 'internal', 'stack trace here'), en)).toBe(en.errors.generic);
    expect(errorMessage(new Error('boom'), en)).toBe(en.errors.generic);
  });
});

describe('admin dictionaries', () => {
  it('translate every admin label into Malay (no key left as English)', () => {
    const same = (a: unknown, b: unknown, path: string[] = []): string[] =>
      typeof a === 'string' && typeof b === 'string'
        ? a === b ? [path.join('.')] : []
        : typeof a === 'object' && a && typeof b === 'object' && b
          ? Object.keys(a).flatMap((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], [...path, k]))
          : [];
    // Product and technical names are legitimately identical in both languages.
    const allowed = new Set(['services.postgres', 'services.googleSheets', 'services.openLibrary', 'services.googleBooks', 'services.cloudflareAccess', 'environmentValues.sheets', 'environmentValues.cloudflare']);
    const untranslated = same(en.admin, ms.admin).filter((p) => !allowed.has(p) && !p.startsWith('latency'));
    expect(untranslated).toEqual([]);
  });
});
