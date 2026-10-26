import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAdminDevClient, AdminApiError } from '../src/features/admin-dev/client.mjs';

const authOrigin = 'https://myproject.supabase.co';
const publishableKey = 'sb_publishable_example';
const reply = (status, body) => new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json'}});

function fixture({ authStatus = 200, allowed = true, counts = {applicationsToReview:2,activeMemberships:4}} = {}) {
  const calls = [];
  const client = createAdminDevClient({ authOrigin, publishableKey, fetchImpl: async (url, opts) => {
    const path = String(url);
    calls.push({path, opts});
    if (path.includes('/auth/v1/token')) return reply(authStatus, authStatus === 200 ? {access_token:'eyJhbGci.abc.def'} : {error:'invalid_grant'});
    if (path.endsWith('/v1/admin/session')) return reply(allowed ? 200 : 403, allowed ? {authorized:true,role:'national_admin'} : {error:'NOT_AUTHORIZED'});
    if (path.endsWith('/v1/admin/dashboard')) return reply(allowed ? 200 : 403, allowed ? counts : {error:'NOT_AUTHORIZED'});
    throw new Error('Unexpected request');
  }});
  return {client,calls};
}

test('configuration Supabase Auth HTTPS seulement', () => {
  assert.throws(() => createAdminDevClient({authOrigin:'http://localhost',publishableKey}), /Invalid/);
  assert.throws(() => createAdminDevClient({authOrigin:'https://example.com',publishableKey}), /Invalid/);
});

test('API sans session : refus local avant tout appel réseau', async () => {
  const {client,calls}=fixture();
  await assert.rejects(client.request('/v1/admin/session'), e=>e.status===401);
  assert.equal(calls.length,0);
});

test('session Supabase puis consultation de compteurs, aucune fiche individuelle', async () => {
  const {client,calls}=fixture();
  await client.signIn('personne@example.invalid','motdepasse-test');
  assert.deepEqual(await client.request('/v1/admin/session'), {authorized:true,role:'national_admin'});
  assert.deepEqual(await client.request('/v1/admin/dashboard'),{applicationsToReview:2,activeMemberships:4});
  assert.equal(calls.length,3);
  assert.equal(calls[1].opts.headers.Authorization,'Bearer eyJhbGci.abc.def');
});

test('compte authentifié sans habilitation : 403', async () => {
  const {client}=fixture({allowed:false});
  await client.signIn('personne@example.invalid','motdepasse-test');
  await assert.rejects(client.request('/v1/admin/session'),e=>e instanceof AdminApiError && e.status===403);
});

test('authentification invalide : aucun accès à l’API', async () => {
  const {client,calls}=fixture({authStatus:400});
  await assert.rejects(client.signIn('x@invalid.example','faux'),e=>e.status===400);
  await assert.rejects(client.request('/v1/admin/dashboard'),e=>e.status===401);
  assert.equal(calls.length,1);
});

test('fermeture de session : jeton effacé de la mémoire du client', async () => {
  const {client,calls}=fixture();
  await client.signIn('personne@example.invalid','motdepasse-test');
  client.clear();
  await assert.rejects(client.request('/v1/admin/session'),e=>e.status===401);
  assert.equal(calls.length,1);
});

test('aucune route arbitraire et aucune écriture autorisée', async () => {
  const {client,calls}=fixture();
  await client.signIn('personne@example.invalid','motdepasse-test');
  await assert.rejects(client.request('/v1/admin/members'),/Unexpected/);
  assert.equal(calls.length,1);
});

test('réponse malformée du tableau de bord refusée', async () => {
  const {client}=fixture({counts:{applicationsToReview:'secret',activeMemberships:1}});
  await client.signIn('personne@example.invalid','motdepasse-test');
  await assert.rejects(client.request('/v1/admin/dashboard'),e=>e.status===503);
});

test('la page de test est isolée du build de production', () => {
  const config=readFileSync('vite.admin-dev.config.mjs','utf8');
  const page=readFileSync('admin-dev.html','utf8');
  const api=readFileSync('src/features/admin-dev/AdminDev.jsx','utf8');
  assert.match(config,/vite\.admin-dev\.config\.mjs|SERVEUR DE TEST/);
  assert.match(config,/5175/);
  assert.match(config,/127\.0\.0\.1:8787/);
  assert.match(config,/publicDir: false/);
  assert.match(page,/src\/features\/admin-dev\/main\.jsx/);
  assert.doesNotMatch(api, /localStorage|sessionStorage/);
});
