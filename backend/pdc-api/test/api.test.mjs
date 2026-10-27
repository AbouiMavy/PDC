import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';
import { bearerToken, makeSupabaseVerifier, AuthError } from '../src/auth.mjs';

const UUID = '11111111-1111-4111-8111-111111111111';

async function serverFixture({ admin = true, stats = { applications_to_review: '3', active_memberships: '2' }, verifier } = {}) {
  const calls = [];
  const app = createApp({
    verifyUser: verifier ?? (async token => { calls.push(['verify', token]); return { id: UUID }; }),
    repository: {
      async isNationalAdmin(id) { calls.push(['access', id]); return admin; },
      async dashboard(id) { calls.push(['stats', id]); return stats; },
    },
    allowedOrigins: ['http://127.0.0.1:5173'],
  });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.address().port}`;
  return { url, calls, close: () => new Promise(resolve => app.close(resolve)) };
}

const token = 'abcdefgh.abcdefgh.abcdefgh';

test('bearer authentication rejects missing, malformed and oversized tokens', () => {
  assert.equal(bearerToken(undefined), null);
  assert.equal(bearerToken('Basic 123'), null);
  assert.equal(bearerToken(`Bearer ${'a'.repeat(4201)}`), null);
  assert.equal(bearerToken(`Bearer ${token}`), token);
});

test('health discloses no private metadata', async () => {
  const s = await serverFixture();
  try {
    const r = await fetch(`${s.url}/health`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { status: 'ok', mode: 'development' });
    assert.equal(r.headers.get('cache-control'), 'no-store');
  } finally { await s.close(); }
});

test('authentication required before any database call', async () => {
  const s = await serverFixture();
  try {
    const r = await fetch(`${s.url}/v1/admin/dashboard`);
    assert.equal(r.status, 401);
    assert.equal(s.calls.length, 0);
  } finally { await s.close(); }
});

test('valid authentication without national role gets 403 and no metrics', async () => {
  const s = await serverFixture({ admin: false });
  try {
    const r = await fetch(`${s.url}/v1/admin/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(r.status, 403);
    assert.equal(s.calls.some(x => x[0] === 'stats'), false);
  } finally { await s.close(); }
});

test('verified national administrator receives only aggregate results', async () => {
  const s = await serverFixture();
  try {
    const r = await fetch(`${s.url}/v1/admin/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { applicationsToReview: 3, activeMemberships: 2 });
    assert.deepEqual(s.calls, [['verify', token], ['access', UUID], ['stats', UUID]]);
  } finally { await s.close(); }
});

test('write operations not implemented and rejected', async () => {
  const s = await serverFixture();
  try {
    const r = await fetch(`${s.url}/v1/admin/dashboard`, { method: 'POST' });
    assert.equal(r.status, 405);
    assert.equal(s.calls.length, 0);
  } finally { await s.close(); }
});

test('CORS is origin-specific without wildcard', async () => {
  const s = await serverFixture();
  try {
    const blocked = await fetch(`${s.url}/health`, { headers: { Origin: 'https://untrusted.example' } });
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
    const allowed = await fetch(`${s.url}/health`, { headers: { Origin: 'http://127.0.0.1:5173' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
    const preflight = await fetch(`${s.url}/v1/admin/session`, { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example' } });
    assert.equal(preflight.status, 403);
  } finally { await s.close(); }
});

test('invalid and unreachable Supabase Auth sessions fail closed', async () => {
  const invalid = makeSupabaseVerifier({ url: 'https://dev.supabase.co', publishableKey: 'public', fetchImpl: async () => new Response('', { status: 401 }) });
  await assert.rejects(invalid(token), e => e instanceof AuthError && e.status === 401);
  const unreachable = makeSupabaseVerifier({ url: 'https://dev.supabase.co', publishableKey: 'public', fetchImpl: async () => { throw new Error('network'); } });
  await assert.rejects(unreachable(token), e => e instanceof AuthError && e.status === 503);
});

test('Supabase Auth user ID is verified by Auth endpoint, not browser-supplied actor ID', async () => {
  let got;
  const verifier = makeSupabaseVerifier({
    url: 'https://dev.supabase.co', publishableKey: 'public-test',
    fetchImpl: async (url, opts) => { got = { url, opts }; return Response.json({ id: UUID, is_anonymous: false }); },
  });
  assert.deepEqual(await verifier(token), { id: UUID });
  assert.equal(got.url, 'https://dev.supabase.co/auth/v1/user');
  assert.equal(got.opts.headers.Authorization, `Bearer ${token}`);
  assert.equal(got.opts.headers.apikey, 'public-test');
  assert.equal(got.opts.redirect, 'error');
  const anonym = makeSupabaseVerifier({ url: 'https://dev.supabase.co', publishableKey: 'public', fetchImpl: async () => Response.json({ id: UUID, is_anonymous: true }) });
  await assert.rejects(anonym(token), e => e instanceof AuthError && e.status === 401);
});

test('database refuses privileged login and missing TLS CA', async () => {
  const { makeAdminRepository } = await import('../src/db.mjs');
  await assert.rejects(
    makeAdminRepository({ PDC_API_ENABLE_DB: 'true', DATABASE_URL: 'postgresql://postgres:secret@host.example:5432/postgres', PDC_PG_CA_FILE: '/tmp/not-reached.pem' }),
    /Privileged database role prohibited/
  );
  await assert.rejects(
    makeAdminRepository({ PDC_API_ENABLE_DB: 'true', DATABASE_URL: 'postgresql://pdc_api:secret@host.example:5432/postgres' }),
    /DATABASE_URL and PDC_PG_CA_FILE required/
  );
});
