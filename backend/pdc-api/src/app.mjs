import { createServer } from 'node:http';
import { bearerToken, AuthError } from './auth.mjs';

// Montants financiers au format entier DECIMAL sous forme de texte :
// pas de Number() sur les bigint PostgreSQL, pour préserver l'exactitude.
export function normalizeFinanceRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 2) throw new Error('Unexpected currencies');
  const keys = [
    ['initial_fee_due_minor', 'initialFeeDueMinor'],
    ['initial_fee_paid_minor', 'initialFeePaidMinor'],
    ['annual_dues_due_minor', 'annualDuesDueMinor'],
    ['annual_dues_paid_minor', 'annualDuesPaidMinor'],
    ['donations_confirmed_minor', 'donationsConfirmedMinor'],
  ];
  const seen = new Set();
  const values = rows.map(row => {
    if (!row || !['XAF', 'EUR'].includes(row.currency) || seen.has(row.currency)) {
      throw new Error('Unsupported or duplicate currency');
    }
    seen.add(row.currency);
    const result = { currency: row.currency };
    for (const [source, target] of keys) {
      const text = String(row[source]);
      if (!/^(0|[1-9][0-9]{0,18})$/.test(text)) throw new Error('Invalid monetary amount');
      result[target] = text;
    }
    return result;
  });
  return values.sort((a, b) => ['XAF','EUR'].indexOf(a.currency) - ['XAF','EUR'].indexOf(b.currency));
}

function respond(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

export function createApp({ verifyUser, repository, allowedOrigins = [] }) {
  if (typeof verifyUser !== 'function' || !repository) throw new Error('missing dependencies');
  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    const originAllowed = typeof origin === 'string' && allowedOrigins.includes(origin);
    const corsHeaders = originAllowed ? {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    } : {};
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (req.method === 'OPTIONS') {
      if (!originAllowed) return respond(res, 403, { error: 'ORIGIN_DENIED' });
      res.writeHead(204, { 'Cache-Control': 'no-store', ...corsHeaders });
      return res.end();
    }
    if (req.method !== 'GET') return respond(res, 405, { error: 'METHOD_NOT_ALLOWED' }, corsHeaders);
    if (path === '/health') return respond(res, 200, { status: 'ok', mode: 'development' }, corsHeaders);
    if (!['/v1/admin/session', '/v1/admin/dashboard', '/v1/admin/finance-overview'].includes(path)) {
      return respond(res, 404, { error: 'NOT_FOUND' }, corsHeaders);
    }
    const token = bearerToken(req.headers.authorization);
    if (!token) return respond(res, 401, { error: 'AUTH_REQUIRED' }, corsHeaders);
    try {
      const user = await verifyUser(token);
      if (!await repository.isNationalAdmin(user.id)) {
        return respond(res, 403, { error: 'NOT_AUTHORIZED' }, corsHeaders);
      }
      if (path === '/v1/admin/session') {
        return respond(res, 200, { authorized: true, role: 'national_admin' }, corsHeaders);
      }
      if (path === '/v1/admin/finance-overview') {
        const rows = await repository.financeOverview(user.id);
        return respond(res, 200, { currencies: normalizeFinanceRows(rows) }, corsHeaders);
      }
      const stats = await repository.dashboard(user.id);
      return respond(res, 200, {
        applicationsToReview: Number(stats.applications_to_review),
        activeMemberships: Number(stats.active_memberships),
      }, corsHeaders);
    } catch (error) {
      if (error instanceof AuthError) {
        return respond(res, error.status, { error: error.code }, corsHeaders);
      }
      // Ne pas exposer les erreurs PostgreSQL/connexions au navigateur.
      return respond(res, 503, { error: 'TEMPORARILY_UNAVAILABLE' }, corsHeaders);
    }
  });
}
