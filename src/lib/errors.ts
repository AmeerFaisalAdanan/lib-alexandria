import { ApiError } from '@/lib/api';
import type { Dictionary } from '@/i18n';

/** A short, translated, user-facing message for a failed action. */
export function errorMessage(e: unknown, t: Dictionary): string {
  if (!(e instanceof ApiError)) return t.errors.generic;
  if (e.isNetwork) return t.errors.network;
  if (e.isUnauthorized) return t.errors.unauthorized;
  if (e.code === 'account_disabled') return t.errors.accountDisabled;
  if (e.code === 'last_admin') return t.errors.lastAdmin;
  if (e.isForbidden) return t.errors.forbidden;
  if (e.status === 404) return t.errors.notFound;
  if (e.code === 'on_loan') return t.errors.onLoan;
  if (e.code === 'own_copy') return t.errors.ownCopy;
  if (e.code === 'rate_limited') return t.errors.rateLimited;
  if (e.code === 'submissions_disabled') return t.errors.submissionsDisabled;
  if (e.status === 409) return t.errors.conflict;
  if (e.status === 400 && e.message) return e.message;
  return t.errors.generic;
}
