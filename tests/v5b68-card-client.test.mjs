import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminDevClient, AdminApiError } from '../src/features/admin-dev/client.mjs';
const TOKEN='abcdefghi.abcdefgh.abcdefgh';
function fixture(payload={cards:[{member_number:'M-PDC-I-000012', card_variant:'cameroon',
  requested_format:'digital',portrait_registered:false}],offset:0,pageSize:50,hasMore:false}) {
  const calls=[];
  const fetchImpl=async (url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).includes('/auth/v1/token')) return Response.json({access_token:TOKEN});
    return Response.json(payload);
  };
  return { client:createAdminDevClient({authOrigin:'https://pdc-test.supabase.co',
    publishableKey:'test-public-key',fetchImpl}),calls };
}
test('Aucune consultation de cartes avant connexion',async()=>{
  const {client,calls}=fixture();
  await assert.rejects(client.request('/v1/admin/cards?offset=0'),e=>e instanceof AdminApiError&&e.status===401);
  assert.equal(calls.length,0);
});
test('Lecture de cartes après authentification ; route et jeton exacts',async()=>{
  const {client,calls}=fixture();
  await client.signIn('test@example.invalid','test');
  const result=await client.request('/v1/admin/cards?offset=0');
  assert.equal(result.cards[0].card_variant,'cameroon');
  assert.equal(calls[1].options.headers.Authorization,`Bearer ${TOKEN}`);
});
test('Routes de délivrance et paramètres imprévus interdits',async()=>{
  const {client,calls}=fixture();await client.signIn('test@example.invalid','test');
  for(const path of ['/v1/admin/cards/issue','/v1/admin/cards?offset=0&format=all',
    '/v1/admin/cards?offset=-50','/v1/admin/cards?offset=100000']) {
    await assert.rejects(client.request(path),/Unexpected administration path/);
  }
  assert.equal(calls.length,1);
});
test('Réponse non conforme rejetée (ne pas afficher des données imprévues)',async()=>{
  const {client}=fixture({cards:[{member_number:'BAD',card_variant:'cameroon',
    requested_format:'both',portrait_registered:true}],pageSize:50,offset:0,hasMore:false});
  await client.signIn('test@example.invalid','test');
  await assert.rejects(client.request('/v1/admin/cards?offset=0'),e=>e instanceof AdminApiError&&e.code==='CARD_QUEUE_BAD_RESPONSE');
});
