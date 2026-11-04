import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handleTreasuryRequest, treasuryQuery } from '../src/treasury-http-v5c44t2.mjs';

async function serve(repository, verifyUser = async () => ({ id: 'actor-from-token' })) {
  const server = createServer(async (req, res) => {
    const handled = await handleTreasuryRequest(req, res, { repository, verifyUser });
    if (!handled) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('query refuses unknown, repeated, malformed and excessive filters', () => {
  for (const raw of ['limit=101', 'offset=-1', 'offset=100001', 'foo=1', 'limit=1&limit=2', 'category=invalid', 'status=other', 'search=%3B']) {
    assert.equal(treasuryQuery(new URLSearchParams(raw)), null, raw);
  }
  assert.deepEqual(treasuryQuery(new URLSearchParams('')), { limit:25, offset:0, category:null, status:null, search:null });
});

test('treasury register rejects unauthenticated and unauthorized access', async t => {
  let reads = 0;
  const { server, base } = await serve({ isNationalTreasury: async () => false, treasuryRegister: async () => { reads++; } });
  t.after(() => server.close());
  let r = await fetch(`${base}/v1/treasury/register`);
  assert.equal(r.status, 401);
  r = await fetch(`${base}/v1/treasury/register`, { headers: { Authorization: 'Bearer valid-token-123' } });
  assert.equal(r.status, 403);
  assert.equal(reads, 0);
});

test('register receives verified actor, filters and stays read-only', async t => {
  let captured;
  const { server, base } = await serve({
    isNationalTreasury: async id => id === 'actor-from-token',
    treasuryRegister: async (actor, query) => { captured = { actor, query }; return { items: [], total: 0 }; },
  });
  t.after(() => server.close());
  const headers = { Authorization: 'Bearer valid-token-123' };
  let r = await fetch(`${base}/v1/treasury/register?limit=10&status=confirmed`, { headers });
  assert.equal(r.status, 200);
  assert.equal(captured.actor, 'actor-from-token');
  assert.equal(captured.query.limit, 10);
  assert.equal(captured.query.status, 'confirmed');
  r = await fetch(`${base}/v1/treasury/register`, { method: 'POST', headers });
  assert.equal(r.status, 405);
});
