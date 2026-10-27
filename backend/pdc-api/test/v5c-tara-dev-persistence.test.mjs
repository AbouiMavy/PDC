import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quoteFromPrivateDb } from '../src/v5c/contracts.mjs';
import { makeTaraDevService } from '../src/v5c/tara-dev-service-v5c.mjs';
import { makeTaraDevPgRepository } from '../src/v5c/tara-dev-pg-repository-v5c.mjs';

const U1='11111111-1111-4111-8111-111111111111';
const U2='22222222-2222-4222-8222-222222222222';
const U3='33333333-3333-4333-8333-333333333333';
const secret='SAMPLE_NON_SECRET_BUSINESS';
const quote=()=>quoteFromPrivateDb({quote_id:U1,payer_id:U2,kind:'individual_initial',
  currency:'XAF',amount_minor:'2000',beneficiary_ids:[U3]});
const urls={returnUrl:'https://pdc.example.org/paiement/retour',
  webHookUrl:'https://dev-api.example.org/tara/webhook'};
function makeFixture({providerFailure=false,mobileAmount='2000'}={}) {
  const byKey=new Map(),byProduct=new Map(), hints=new Set(),evidence=[];
  let linkCalls=0,claimed=0;
  const repository={
    async reserveCheckout(v) {
      if(byKey.has(v.idempotencyKey)) return byKey.get(v.idempotencyKey);
      const row={...v,linkState:'reserved',generalLink:null};
      byKey.set(v.idempotencyKey,row);byProduct.set(row.productId,row);
      return {...row};
    },
    async claimLinkRequest(id) {
      claimed++;
      const row=byProduct.get(id);
      if(row?.linkState!=='reserved') return false;
      row.linkState='requested';return true;
    },
    async saveIssuedLink(id,url) {
      const r=byProduct.get(id);if(r.linkState!=='requested') throw Error('state');
      r.generalLink=url;r.linkState='issued';
    },
    async markLinkUnknown(id) {
      const row=byProduct.get(id);
      if(row.linkState==='requested'){row.linkState='unknown';return true;}
      return false;
    },
    async insertUntrustedWebhookOnce(hint) {
      if(hints.has(hint.eventId))return false;hints.add(hint.eventId);return true;
    },
    async loadCheckout(id) {return byProduct.get(id)??null;},
    async recordEvidence(d) {evidence.push(d);},
  };
  const taraClient={
    async createPaymentLink(input) {
      linkCalls++;
      if(providerFailure) throw Error('sensitive response should not be leaked');
      assert.equal(input.productPrice,2000);
      return {generalLink:'https://taramoney.com/pay/mock-opaque'};
    },
    async checkMobileStatus(id) {return {productId:id,status:'SUCCESS'};},
    async listTransactions({start}) {
      if(start>0)return [];
      const id=[...byProduct.keys()][0];
      return [{transactionId:id,currency:'XAF',amount:mobileAmount,status:'PAID'}];
    },
  };
  const service=makeTaraDevService({repository,taraClient,expectedBusinessId:secret,
    ...urls,enabled:true,environment:'sandbox'});
  return {service,repository,evidence,byProduct,stats:()=>({linkCalls,claimed,hints:hints.size})};
}
const args={quote:quote(),paymentId:U1,idempotencyKey:'v5c-safe-request-000001'};

test('DEV exige sandbox et opt-in explicite',()=>{
  assert.throws(()=>makeTaraDevService({enabled:false,environment:'sandbox'}),/DEV_DISABLED/);
  assert.throws(()=>makeTaraDevService({enabled:true,environment:'production'}),/DEV_DISABLED/);
});
test('devis non issu de la DB privee rejete avant reserve et reseau',async()=>{
  const v=makeFixture();
  await assert.rejects(v.service.initiate({quote:{...args.quote},paymentId:U1,
    idempotencyKey:args.idempotencyKey}),/TRUSTED_QUOTE_REQUIRED/);
  assert.equal(v.stats().linkCalls,0);
});
test('initiation XAF n appelle le prestataire qu apres reservation et claim',async()=>{
  const v=makeFixture();const r=await v.service.initiate(args);
  assert.equal(r.status,'issued');assert.match(r.productId,/^PDC_[\w-]{24}$/);
  assert.equal(v.stats().linkCalls,1);assert.equal(v.stats().claimed,1);
});
test('repetition idempotente ne genere jamais un second lien',async()=>{
  const v=makeFixture(); const x=await v.service.initiate(args);
  const y=await v.service.initiate(args);
  assert.deepEqual(y,x);assert.equal(v.stats().linkCalls,1);
});
test('refuse un autre paiement avec la meme cle idempotente',async()=>{
  const v=makeFixture();await v.service.initiate(args);
  await assert.rejects(v.service.initiate({...args,paymentId:U3}),/IDEMPOTENCY_CONFLICT/);
  assert.equal(v.stats().linkCalls,1);
});
test('timeout fournisseur passe en revue humaine sans reenvoi automatique',async()=>{
  const v=makeFixture({providerFailure:true});
  const first=await v.service.initiate(args);const second=await v.service.initiate(args);
  assert.equal(first.status,'manual_review');assert.equal(second.status,'manual_review');
  assert.equal(v.stats().linkCalls,1);
  assert.equal(v.byProduct.get(first.productId).linkState,'unknown');
});
test('webhook SUCCESS accepte uniquement comme indice non verifie',async()=>{
  const v=makeFixture();const r=await v.service.initiate(args);
  const raw=JSON.stringify({businessId:secret,paymentId:'pay_123',productId:r.productId,
    collectionId:'27731',amount:'2000',status:'SUCCESS'});
  assert.deepEqual(await v.service.receiveWebhook(raw),
    {accepted:true,duplicate:false,verified:false});
  assert.deepEqual(await v.service.receiveWebhook(raw),
    {accepted:true,duplicate:true,verified:false});
  assert.equal(v.stats().hints,1);assert.equal(v.evidence.length,0);
});
test('compte marchand du webhook non attendu refuse',async()=>{
  const v=makeFixture();const r=await v.service.initiate(args);
  await assert.rejects(v.service.receiveWebhook(JSON.stringify({businessId:'WRONG',
    paymentId:'p',productId:r.productId,collectionId:'2',amount:'2000',status:'SUCCESS'})),
    /WEBHOOK_INVALID/);
});
test('status et liste coherents donnent une preuve DEV, PAS payment confirmed',async()=>{
  const v=makeFixture();const r=await v.service.initiate(args);
  const d=await v.service.inspectPayment({productId:r.productId});
  assert.equal(d.decision,'corroborated');
  assert.equal(d.paymentConfirmed,false);assert.equal(d.admissionGranted,false);
  assert.equal(v.evidence[0].decision,'corroborated');
});
test('montant discordant place en revue humaine',async()=>{
  const v=makeFixture({mobileAmount:'3000'});const r=await v.service.initiate(args);
  assert.equal((await v.service.inspectPayment({productId:r.productId})).decision,'manual_review');
});
test('carte bancaire sans API de statut carte documentee reste en revue humaine',async()=>{
  const v=makeFixture();const r=await v.service.initiate(args);
  const d=await v.service.inspectPayment({productId:r.productId,paymentChannel:'card'});
  assert.equal(d.decision,'manual_review');assert.equal(d.paymentConfirmed,false);
});
test('commande inconnue non rapprocheable',async()=>{
  const v=makeFixture();await assert.rejects(v.service.inspectPayment({productId:'PDC_'+ 'a'.repeat(24)}),
    /INTENT_NOT_READY/);
});
test('pas de role admin ni service_role accepte pour le depot PostgreSQL',async()=>{
  for(const role of ['postgres','service_role','pdc_api_runtime_v5b3']) {
    const pool={query:async()=>({rows:[{role_name:role}]}),connect:async()=>({})};
    await assert.rejects(makeTaraDevPgRepository({pool,enabled:true,environment:'sandbox'}),/WRONG_ROLE/);
  }
});
test('depot PostgreSQL inactif par defaut',async()=>{
  await assert.rejects(makeTaraDevPgRepository({}),/PG_DISABLED/);
});
test('depot PostgreSQL ne tente aucune requete avec environnement production',async()=>{
  let called=false;
  const pool={query:async()=>{called=true;},connect:async()=>{called=true;}};
  await assert.rejects(makeTaraDevPgRepository({pool,enabled:true,environment:'production'}),/PG_DISABLED/);
  assert.equal(called,false);
});
test('migration seulement additive, RLS et interdiction aux roles publics',()=>{
  const src=readFileSync(new URL('../../../supabase/migrations/20261027002000_pdc_v5c_tara_preconciliation_dev.sql',import.meta.url),'utf8');
  assert.match(src,/CREATE TABLE pdc_private\.tara_checkout_intents_v5c/);
  assert.match(src,/CREATE TABLE pdc_private\.tara_webhook_inbox_v5c/);
  assert.match(src,/CREATE TABLE pdc_private\.tara_reconciliation_evidence_v5c/);
  assert.match(src,/ENABLE ROW LEVEL SECURITY/);
  assert.match(src,/REVOKE ALL ON TABLE/);
  assert.match(src,/anon, authenticated, service_role/);
  assert.doesNotMatch(src,/\b(?:GRANT|ALTER)\s+(?:INSERT|UPDATE|DELETE)\s+ON/i);
  assert.doesNotMatch(src,/ALTER TABLE\s+pdc_private\.payment_attempts/i);
  assert.doesNotMatch(src,/CREATE POLICY/i);
});
test('aucune route HTTP, aucun secret ou acces navigateur ajoute',()=>{
  const paths=['tara-dev-service-v5c.mjs','tara-dev-pg-repository-v5c.mjs'];
  for(const file of paths){
    const src=readFileSync(new URL('../src/v5c/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(src,/from\s+['"](?:react|express|@taramoney\/react-sdk)['"]/);
    assert.doesNotMatch(src,/VITE_TARA_|app\.post\(|createServer\(/);
  }
});

test('dépôt SQL DEV ne dispose que de la RPC de réservation paramétrée',async()=>{
  const calls=[];
  const row={productId:'PDC_'+ 'a'.repeat(24),paymentId:U1,quoteId:U2,payerId:U3,
    idempotencyKey:'safe-idempotency-0000001',amountXaf:'2000',currency:'XAF',
    linkState:'reserved',generalLink:null};
  const pool={query:async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.startsWith('SELECT current_user'))return {rows:[{role_name:'pdc_tara_v5c_writer'}]};
    if(sql.includes('tara_v5c_reserve_intent'))return {rows:[row]};
    throw Error('unexpected');
  }};
  const repository=await makeTaraDevPgRepository({pool,enabled:true,environment:'sandbox'});
  const stored=await repository.reserveCheckout({productId:row.productId,paymentId:U1,
    quoteId:U2,payerId:U3,idempotencyKey:row.idempotencyKey,amountXaf:'2000'});
  assert.equal(stored.productId,row.productId);
  assert.equal(calls.length,2);
  assert.match(calls[1].sql,/SELECT \* FROM pdc_private\.tara_v5c_reserve_intent/);
  assert.deepEqual(calls[1].params,[row.productId,U1,U2,U3,row.idempotencyKey,'2000']);
  assert.doesNotMatch(calls[1].sql,/INSERT|UPDATE|DELETE|COMMIT|BEGIN/);
  assert.doesNotMatch(calls[1].sql,/safe-idempotency-0000001/);
});

test('reception webhook ne peut pas prendre une preuve comme verified=true',async()=>{
  let called=false;
  const pool={query:async(sql,params)=>{
      if(sql.startsWith('SELECT current_user'))return {rows:[{role_name:'pdc_tara_v5c_writer'}]};
      called=true;return {rowCount:1};
    },connect:async()=>({})};
  const r=await makeTaraDevPgRepository({pool,enabled:true,environment:'sandbox'});
  await assert.rejects(r.insertUntrustedWebhookOnce({trusted:true,verification:'required'}),/NOT_UNTRUSTED/);
  assert.equal(called,false);
});

test('evidence transmise uniquement à RPC, aucune écriture directe de paiement',async()=>{
  let sqlCaptured='';
  const pool={query:async(sql)=>{
    if(sql.startsWith('SELECT current_user')) return {rows:[{role_name:'pdc_tara_v5c_writer'}]};
    sqlCaptured=sql;return {rows:[{ok:true}]};}};
  const r=await makeTaraDevPgRepository({pool,enabled:true,environment:'sandbox'});
  await r.recordEvidence({productId:'PDC_'+'a'.repeat(24),decision:'corroborated',
    reason:null,expectedAmountXaf:'2000',paymentChannel:'mobile'});
  assert.match(sqlCaptured,/SELECT pdc_private\.tara_v5c_record_evidence/);
  assert.doesNotMatch(sqlCaptured,/UPDATE pdc_private\.payment_attempts|INSERT INTO pdc_private\.payment_events/);
});
