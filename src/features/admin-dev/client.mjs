import { validateFinanceResponse } from './finance.mjs';
// Client de développement — aucune session stockée en localStorage, cookie ou disque.
const apiPrefix = '/__pdc_admin_api';

export class AdminApiError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

export function createAdminDevClient({ authOrigin, publishableKey, fetchImpl = fetch }) {
  const origin = new URL(authOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash ||
      (origin.pathname !== '/' && origin.pathname !== '') || !origin.hostname.endsWith('.supabase.co')) {
    throw new Error('Invalid Supabase Auth origin');
  }
  if (!publishableKey) throw new Error('Missing publishable key');
  let bearer = null;  // mémoire du processus seulement, jamais persistée.

  async function decode(r) {
    let body = {};
    try { body = await r.json(); } catch { /* non-JSON reply */ }
    if (!r.ok) {
      throw new AdminApiError(r.status, body?.error || body?.error_code || 'REQUEST_FAILED');
    }
    return body;
  }

  return {
    async signIn(email, password) {
      bearer = null;
      if (!email || !password) throw new AdminApiError(400, 'MISSING_CREDENTIALS');
      const response = await fetchImpl(new URL('/auth/v1/token?grant_type=password', origin), {
        method: 'POST',
        headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        cache: 'no-store',
        redirect: 'error',
      });
      const body = await decode(response);
      if (!body?.access_token || typeof body.access_token !== 'string') {
        throw new AdminApiError(503, 'AUTH_BAD_RESPONSE');
      }
      bearer = body.access_token;
      return true;
    },
    async request(path) {
      if (!bearer) throw new AdminApiError(401, 'AUTH_REQUIRED');
      if (!['/v1/admin/session', '/v1/admin/dashboard', '/v1/admin/finance-overview'].includes(path)) {
        throw new Error('Unexpected administration path');
      }
      const response = await fetchImpl(`${apiPrefix}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearer}` },
        cache: 'no-store',
        redirect: 'error',
      });
      const result = await decode(response);
      if (path === '/v1/admin/dashboard') {
        if (!Number.isSafeInteger(result.applicationsToReview) || result.applicationsToReview < 0 ||
            !Number.isSafeInteger(result.activeMemberships) || result.activeMemberships < 0) {
          throw new AdminApiError(503, 'DASHBOARD_BAD_RESPONSE');
        }
      }
      if (path === '/v1/admin/finance-overview') {
        try { validateFinanceResponse(result); }
        catch { throw new AdminApiError(503, 'FINANCE_BAD_RESPONSE'); }
      }
      return result;
    },
    clear() { bearer = null; },
  };
}
