import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makePublicOrderPgV5C} from '../src/v5c/tara-public-order-pg-v5c.mjs';
import {preparePrivateCheckout} from '../src/v5c/contracts.mjs';
const paymentId='11111111-1111-4111-8111-111111111111';
const payerId='22222222-2222-4222-8222-222222222222';
const quoteId='33333333-3333-4333-8333-333333333333';
const donor={kind:'donation',idempotencyKey:'public-v5c-abcd-123456',
  firstName:'Anne',lastName:'Exemple',email:'anne@example.org',
  phoneE164:'+237699123456',country:'CM',method:'mobile',amountXaf:'500',
  donorDeclaration:true,designations:[{purpose:'libre',percentBps:10000}]};
const initial={kind:'initial_membership',idempotencyKey:'public-v5c-adh-123456',
  firstName:'Jean',lastName:'Exemple',email:'jean@example.org',
  phoneE164:'+237699123456',country:'CM',method:'tara',messagingChannel:'whatsapp',
  civility:'Monsieur',dob:'1990-01-01',birthPlace:'Yaoundé',memberCategory:'urbain',
  acceptedStatutes:true,acceptedDataNotice:true};
const makePool=(row,requests)=>({query:async(sql,params=[])=>{
  requests.push({sql,params});
  if(sql.startsWith('SELECT current_user'))return {rows:[{role_name:'pdc_tara_v5c_writer'}]};
  if(sql.includes('tara_v5c_create_public_order'))return {rows:[row]};
  throw Error('Unexpected SQL');
}});
const result=(kind,amount)=>({paymentId,quoteId,payerId,kind,amountMinor:amount,currency:'XAF',
  beneficiaryIds:kind==='donation'?[]:[payerId]});
test('refuse tout service public activé sans sandbox explicite',async()=>{
  await assert.rejects(makePublicOrderPgV5C({}),/DB_DISABLED/);
  await assert.rejects(makePublicOrderPgV5C({enabled:true,environment:'production'}),/DB_DISABLED/);
});
test('refuse une connexion service_role et admin',async()=>{
  const pool={query:async()=>({rows:[{role_name:'service_role'}]})};
  await assert.rejects(makePublicOrderPgV5C({pool,enabled:true,environment:'sandbox'}),/ROLE_INVALID/);
});
test('don public: montant brut 500 XAF et allocation privée',async()=>{
  const req=[];
  const repo=await makePublicOrderPgV5C({pool:makePool(result('donation','500'),req),
    enabled:true,environment:'sandbox'});
  const out=await repo.create(donor);
  assert.equal(out.grossAmountXaf,'500');assert.equal(out.quote.amountMinor,'500');
  assert.equal(out.paymentConfirmed,false); assert.equal(out.membershipGranted,false);
  assert.equal(req.length,2);
  assert.match(req[1].sql,/SELECT \* FROM pdc_private\.tara_v5c_create_public_order\(\$1::jsonb\)/);
  assert.equal(req[1].params.length,1);
  const p=JSON.parse(req[1].params[0]);
  assert.equal(p.method,'mobile');assert.equal(p.grossAmountXaf,'500');
  assert.equal(p.designations[0].percentBps,10000);
  assert.equal('donorDeclaration' in p,false);
  assert.equal('apiKey' in p,false);
});
test('adhésion individuelle: 2000 XAF fixés serveur, devis utilisable par l’orchestrateur',async()=>{
  const req=[];
  const repo=await makePublicOrderPgV5C({pool:makePool(result('individual_initial','2000'),req),
    enabled:true,environment:'sandbox'});
  const out=await repo.create(initial);
  assert.equal(out.quote.amountMinor,'2000');
  assert.deepEqual(out.quote.beneficiaryIds,[payerId]);
  assert.equal(out.messagingChannel,'whatsapp');
  const checkout=preparePrivateCheckout({quote:out.quote,paymentId:out.paymentId,
    provider:'tara',idempotencyKey:'public-v5c-adh-123456'});
  assert.equal(checkout.state,'not_started');
});
test('échec fermé si SQL renvoie un montant différent',async()=>{
  const req=[];
  const repo=await makePublicOrderPgV5C({pool:makePool(result('donation','501'),req),
    enabled:true,environment:'sandbox'});
  await assert.rejects(repo.create(donor),/DB_RESPONSE_INVALID/);
});
test('échec fermé si paiement dupliqué ou résultat absent',async()=>{
  const req=[];
  const repo=await makePublicOrderPgV5C({pool:makePool(null,req),
    enabled:true,environment:'sandbox'});
  await assert.rejects(repo.create(donor),/DB_RESPONSE_INVALID/);
});
test('validation des champs avant SQL : pas de prix navigateur pour adhésion',async()=>{
  const req=[];
  const repo=await makePublicOrderPgV5C({pool:makePool(result('individual_initial','2000'),req),
    enabled:true,environment:'sandbox'});
  await assert.rejects(repo.create({...initial,amountXaf:'100'}),/MEMBERSHIP_INVALID/);
  assert.equal(req.length,1);
});
test('migration additive restreinte, aucun paiement confirmé',()=>{
  const sql=readFileSync(new URL('../../../supabase/migrations/20261028002300_pdc_v5c_public_order_atomic_dev.sql',import.meta.url),'utf8');
  assert.match(sql,/CREATE TABLE pdc_private\.public_checkout_orders_v5c/);
  assert.match(sql,/CREATE FUNCTION pdc_private\.tara_v5c_create_public_order/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/pdc_private\.payment_allocations/);
  assert.match(sql,/gross_amount_xaf/);
  assert.match(sql,/REVOKE ALL ON FUNCTION/);
  assert.match(sql,/TO pdc_tara_v5c_writer/);
  assert.doesNotMatch(sql,/status\s*=\s*'confirmed'|confirmed_at\s*=/);
  assert.doesNotMatch(sql,/CREATE POLICY/);
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE/);
});
