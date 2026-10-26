// Supabase Auth user endpoint reste utilisable lorsque la Data API est désactivée.
export function bearerToken(header) {
  if (typeof header !== 'string' || header.length > 4200) return null;
  const found = /^Bearer ([A-Za-z0-9_.~+\/-]{8,4096}={0,2})$/.exec(header);
  return found?.[1] ?? null;
}

export class AuthError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export function makeSupabaseVerifier({ url, publishableKey, fetchImpl = fetch }) {
  if (!url || !publishableKey) throw new Error('Supabase Auth config missing');
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash || target.pathname !== '/') {
    throw new Error('SUPABASE_URL must be an HTTPS origin');
  }
  const endpoint = new URL('/auth/v1/user', target).toString();
  return async token => {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'GET',
        headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      throw new AuthError(503, 'AUTH_UNAVAILABLE');
    }
    if (response.status === 401 || response.status === 403) throw new AuthError(401, 'INVALID_SESSION');
    if (!response.ok) throw new AuthError(503, 'AUTH_UNAVAILABLE');
    let user;
    try { user = await response.json(); }
    catch { throw new AuthError(503, 'AUTH_UNAVAILABLE'); }
    if (!user || typeof user.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id) || user.is_anonymous === true) {
      throw new AuthError(401, 'INVALID_SESSION');
    }
    return { id: user.id };
  };
}
