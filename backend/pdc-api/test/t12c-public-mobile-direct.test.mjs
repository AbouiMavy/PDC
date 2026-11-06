import test from 'node:test';
import assert from 'node:assert/strict';
import {makePublicMobileDirectT12C,normalizeCameroonDebitT12C} from '../src/v5c/mobile-direct-public-t12c.mjs';
const paymentId='cd74e6be-04a2-4469-ab12-a23b187c3852';
const quoteId='f5994972-6df1-44de-b32d-2329c9cff897';
const payerId='fd632444-10d4-44cd-9481-60ee7a43a8c3';
const productId='PDC_'+'x'.repeat(24);
const idempotencyKey='t12c_tests_dedup_000001';
const order={method:'mobile',mobileMode:'direct',messagingChannel:null,
  mobilePhone:'699 123 456',paymentId,
  quote:{quoteId,payerId,kind:'donation',amountMinor:'5000'}};
const row={productId,paymentId,quoteId,payerId,idempotencyKey,amountXaf:'5000',currency:'XAF',linkState:'reserved'};
const config={enabled:true,environment:'sandbox',webHookUrl:'https://example.test/webhook',
  phoneHmacKey:'TEST-ONLY-HMAC-NEVER-USE-IN-SANDBOX'};
function mock({state='reserved',claim=true,saved=true}={}){
  const calls=[];const pool={async query(sql,params){calls.push({sql,params});
    if(sql.includes('current_user'))return {rows:[{role_name:'pdc_tara_v5c_writer'}]};
    if(sql.includes('t12_v5c_claim_mobile_direct_dev'))return {rows:[{ok:claim}]};
    if(sql.includes('t12_v5c_finish_mobile_direct_dev'))return {rows:[{ok:saved}]};
    if(sql.includes('t12_v5c_mark_mobile_unknown_dev'))return {rows:[{ok:true}]};
    throw Error('Unexpected query');
  }};return {pool,calls,row:{...row,linkState:state}};
}
test('T12-C normalise uniquement les numéros camerounais',()=>{
  assert.equal(normalizeCameroonDebitT12C('+237 699 123 456'),'237699123456');
  assert.throws(()=>normalizeCameroonDebitT12C('+33612345678'),/PHONE_INVALID/);
});
test('T12-C refuse démarrage sans opt-in ou mauvais rôle',async()=>{
  const {pool}=mock();
  await assert.rejects(makePublicMobileDirectT12C({pool,mobileClient:{initiate(){}},...config,enabled:false}),/DISABLED/);
  await assert.rejects(makePublicMobileDirectT12C({pool:{query:async()=>({rows:[{role_name:'postgres'}]})},mobileClient:{initiate(){}},...config}),/ROLE_INVALID/);
});
test('T12-C SUCCESS: un seul appel, productId/quote issus SQL, aucune confirmation',async()=>{
  const {pool,calls}=mock();let hits=0;
  const s=await makePublicMobileDirectT12C({...config,pool,mobileClient:{async initiate(x){
    hits++;assert.equal(x.productId,productId);assert.equal(x.phoneNumber,'237699123456');
    assert.equal(x.amountXaf,'5000');return {productId,status:'request_initiated',providerStatus:'SUCCESS',
      providerMessage:'API_ORDER_SUCESSFULL',vendor:'MTN_CAMEROON',paymentConfirmed:false,membershipGranted:false};
  }}});
  const result=await s.initiate({order,row,idempotencyKey});
  assert.equal(hits,1);assert.equal(result.status,'request_initiated');
  assert.equal(result.paymentConfirmed,false);assert.equal(result.membershipGranted,false);
  const claim=calls.find(c=>c.sql.includes('t12_v5c_claim_mobile_direct_dev'));
  assert.equal(claim.params[5],'3456');assert.match(claim.params[4],/^[0-9a-f]{64}$/);
  assert.equal(calls.some(c=>JSON.stringify(c).includes('237699123456')),false);
});
test('T12-C FAILURE conserve le paiement non confirmé',async()=>{
  const {pool}=mock();let hits=0;
  const s=await makePublicMobileDirectT12C({...config,pool,mobileClient:{async initiate(){hits++;return {
    productId,status:'request_rejected',providerStatus:'FAILURE',providerMessage:'DECLINED',
    paymentConfirmed:false,membershipGranted:false};}}});
  const r=await s.initiate({order,row,idempotencyKey});
  assert.equal(hits,1);assert.equal(r.status,'request_rejected');assert.equal(r.paymentConfirmed,false);
});
test('T12-C ancien SMS émis ou claim refusé : aucun débit',async()=>{
  for(const opts of [{state:'issued'},{claim:false}]){
    const {pool,row:reserved}=mock(opts);let hits=0;
    const s=await makePublicMobileDirectT12C({...config,pool,mobileClient:{initiate(){hits++;}}});
    assert.equal((await s.initiate({order,row:reserved,idempotencyKey})).status,'manual_review');
    assert.equal(hits,0);
  }
});
test('T12-C timeout: une tentative, unknown enregistré, jamais de retry',async()=>{
  const {pool,calls}=mock();let hits=0;
  const s=await makePublicMobileDirectT12C({...config,pool,mobileClient:{async initiate(){hits++;throw Error('timeout');}}});
  const r=await s.initiate({order,row,idempotencyKey});
  assert.equal(hits,1);assert.equal(r.status,'manual_review');
  assert.ok(calls.some(c=>c.sql.includes('t12_v5c_mark_mobile_unknown_dev')));
});
test('T12-C mauvais devis ou méthode: refus avant appel',async()=>{
  const {pool,calls}=mock();let hits=0;
  const s=await makePublicMobileDirectT12C({...config,pool,mobileClient:{initiate(){hits++;}}});
  await assert.rejects(s.initiate({order:{...order,method:'tara'},row,idempotencyKey}),/ORDER_INVALID/);
  await assert.rejects(s.initiate({order,row:{...row,amountXaf:'6000'},idempotencyKey}),/ORDER_INVALID/);
  assert.equal(hits,0);assert.equal(calls.filter(c=>c.sql.includes('claim_mobile')).length,0);
});
