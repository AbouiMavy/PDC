import { bearerToken, AuthError } from './auth.mjs';

function reply(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

const CATEGORIES = new Set(['adhesion_diaspora', 'adhesion_cameroun', 'don', 'cotisation_annuelle', 'historique_a_qualifier']);
const STATUSES = new Set(['initiated', 'pending', 'confirmed', 'failed', 'cancelled']);

export function treasuryQuery(searchParams) {
  const allowed = new Set(['limit', 'offset', 'category', 'status', 'search']);
  const keys = [...searchParams.keys()];
  if (keys.length !== new Set(keys).size || keys.some(k => !allowed.has(k))) return null;
  const limitText = searchParams.get('limit') ?? '25';
  const offsetText = searchParams.get('offset') ?? '0';
  if (!/^[1-9][0-9]{0,2}$/.test(limitText) || !/^(0|[1-9][0-9]{0,5})$/.test(offsetText)) return null;
  const limit = Number(limitText), offset = Number(offsetText);
  if (limit > 100 || offset > 100000) return null;
  const category = searchParams.get('category') || null;
  const status = searchParams.get('status') || null;
  const search = searchParams.get('search') || null;
  if (category && !CATEGORIES.has(category)) return null;
  if (status && !STATUSES.has(status)) return null;
  if (search && (search.length > 120 || !/^[A-Za-z0-9_-]+$/.test(search))) return null;
  return { limit, offset, category, status, search };
}

// Returns true only when this module has handled the request.
// Explicitly read-only: no record/confirm endpoints are exposed in lot 1.
export async function handleTreasuryRequest(req, res, { verifyUser, repository, allowedOrigins = [] }) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/v1/treasury/register' && url.pathname !== '/v1/treasury/session') return false;
  const origin = req.headers.origin;
  const cors = typeof origin === 'string' && allowedOrigins.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
    : {};
  if (req.method === 'OPTIONS') {
    if (!Object.keys(cors).length) reply(res, 403, { error: 'ORIGIN_DENIED' });
    else { res.writeHead(204, { 'Cache-Control': 'no-store', ...cors }); res.end(); }
    return true;
  }
  if (req.method !== 'GET') { reply(res, 405, { error: 'METHOD_NOT_ALLOWED' }, cors); return true; }
  const token = bearerToken(req.headers.authorization);
  if (!token) { reply(res, 401, { error: 'AUTH_REQUIRED' }, cors); return true; }
  try {
    const user = await verifyUser(token);
    if (!await repository.isNationalTreasury(user.id)) {
      reply(res, 403, { error: 'NOT_AUTHORIZED' }, cors); return true;
    }
    if (url.pathname === '/v1/treasury/session') {
      if (url.search) reply(res, 400, { error: 'INVALID_QUERY' }, cors);
      else reply(res, 200, { authorized: true, role: 'national_treasury' }, cors);
      return true;
    }
    const query = treasuryQuery(url.searchParams);
    if (!query) { reply(res, 400, { error: 'INVALID_QUERY' }, cors); return true; }
    const result = await repository.treasuryRegister(user.id, query);
    reply(res, 200, result, cors);
  } catch (error) {
    if (error instanceof AuthError) reply(res, error.status, { error: error.code }, cors);
    else {
      console.error('[TREASURY_DEV_ERROR]', {
        code: error.code ?? null,
        message: error.message,
        routine: error.routine ?? null
      });
      reply(res, 503, { error: 'TEMPORARILY_UNAVAILABLE' }, cors);
    }
    ;
  }
  return true;
}
