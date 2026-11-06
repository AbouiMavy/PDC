import test from 'node:test';
import assert from 'node:assert/strict';
import {makePublicMobileDirectT12C} from '../src/v5c/mobile-direct-public-t12c.mjs';
import {makeDiasporaMobileDirectR5T12} from '../src/r5/mobile-direct-r5-t12.mjs';
const paymentId='cd74e6be-04a2-4469-ab12-a23b187c3852';
const quoteId='f5994972-6df1-44de-b32d-2329c9cff897';
const payerId='fd632444-10d4-44cd-9481-60ee7a43a8c3';
const productId='PDC_'+'x'.repeat(24);
const idem='t12g_tests_dedup_000001';
const row={productId,paymentId,quoteId,payerId,idempotencyKey:idem,amountXaf:'5000',currency:'XAF',linkState:'reserved'};
function pg(role){
  const calls=[];const pool={async query(sql,params){calls.push({sql,params});
    if(sql.includes('current_user'))return {rows:[{role_name:role}]};
    if(sql.includes('r5_reserve_tara_intent_dev'))return {rows:[{product_id:productId,payment_id:paymentId,amount_xaf:'5000',link_state:'reserved'}]};
    if(/(t12_v5c|r5)_claim_mobile_direct/.test(sql))return {rows:[{ok:true}]};
    if(/(t12_v5c|r5)_finish_mobile_direct/.test(sql))return {rows:[{ok:true}]};
    if(sql.includes('mark_mobile'))return {rows:[{ok:true}]};
    throw Error('Unexpected SQL in isolated mock: '+sql);
  }};return {pool,calls};
}
const launch={productId,status:'request_initiated',providerStatus:'SUCCESS',
  providerMessage:'API_ORDER_SUCESSFULL',vendor:'WAVE',paymentConfirmed:false,membershipGranted:false};
test('T12-G: V5-C Wave Senegal arrive chez client API apres claim prive',async()=>{
  const {pool,calls}=pg('pdc_tara_v5c_writer');let count=0;
  const svc=await makePublicMobileDirectT12C({pool,enabled:true,environment:'sandbox',
    webHookUrl:'https://example.test/hook',phoneHmacKey:'TEST-ONLY-HMAC-NEVER-USE-IN-SANDBOX',
    mobileClient:{async initiate(x){count++;assert.equal(x.phoneNumber,'221771234567');
      assert.equal(x.network,'Wave');assert.equal(x.productId,productId);return launch;}}});
  const r=await svc.initiate({row,idempotencyKey:idem,order:{method:'mobile',mobileMode:'direct',
    mobileCountry:'SN',mobileNetwork:'Wave',mobilePhone:'+221771234567',messagingChannel:null,
    paymentId,quote:{quoteId,payerId,kind:'donation',amountMinor:'5000'}}});
  assert.equal(r.status,'request_initiated');assert.equal(r.paymentConfirmed,false);assert.equal(count,1);
  assert.ok(calls.some(c=>c.sql.includes('claim_mobile_direct')));
  assert.ok(calls.every(c=>!JSON.stringify(c).includes('221771234567')));
});
test('T12-G: R5 Wave Cote Ivoire et somme CFA, sans second appel',async()=>{
  const {pool,calls}=pg('pdc_r5_intake_writer');let count=0;
  const svc=await makeDiasporaMobileDirectR5T12({pool,enabled:true,environment:'sandbox',
    webHookUrl:'https://example.test/hook',phoneHmacKey:'TEST-ONLY-HMAC-NEVER-USE-IN-SANDBOX',
    createProductId:()=>productId,
    mobileClient:{async initiate(x){count++;assert.equal(x.network,'Wave');
      assert.equal(x.phoneNumber,'2250701234567');assert.equal(x.amountXaf,'5000');return launch;}}});
  const r=await svc.create({orderId:'c8d7a26a-84ab-4d36-a5f5-447f6a232f4e',
    sessionToken:'A'.repeat(43),method:'mobile',mobileMode:'direct',
    mobileCountry:'CI',mobileNetwork:'Wave',mobilePhone:'0701234567',language:'fr'});
  assert.equal(r.status,'request_initiated');assert.equal(count,1);
  assert.ok(calls.some(c=>c.sql.includes('claim_mobile_direct')));
});
test('T12-G: ancien dossier camerounais passe sans network',async()=>{
  const {pool}=pg('pdc_r5_intake_writer');let sent;
  const svc=await makeDiasporaMobileDirectR5T12({pool,enabled:true,environment:'sandbox',
    webHookUrl:'https://example.test/hook',phoneHmacKey:'TEST-ONLY-HMAC-NEVER-USE-IN-SANDBOX',
    createProductId:()=>productId,mobileClient:{async initiate(x){sent=x;return launch;}}});
  await svc.create({orderId:'c8d7a26a-84ab-4d36-a5f5-447f6a232f4e',
    sessionToken:'A'.repeat(43),method:'mobile',mobileMode:'direct',mobilePhone:'699123456'});
  assert.equal(sent.phoneNumber,'237699123456');assert.equal('network' in sent,false);
});
