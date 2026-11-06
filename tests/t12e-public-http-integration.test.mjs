// T12-E: tests d'intégration HTTP hors réseau prestataire/hors Supabase.
// Seul un serveur loopback éphémère est créé; aucun paiement ni écritures réelles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteFromPrivateDb} from '../backend/pdc-api/src/v5c/contracts.mjs';
import {makePublicCheckoutCoordinatorV5C} from '../backend/pdc-api/src/v5c/tara-public-checkout-coordinator-v5c.mjs';
import {makePublicMobileDirectT12C} from '../backend/pdc-api/src/v5c/mobile-direct-public-t12c.mjs';
import {createPublicOrderHttpV5C} from '../backend/pdc-api/src/v5c/tara-public-order-http-v5c.mjs';
import {validateMobileDirectResponseT12} from '../src/features/payments/mobile-direct-response-t12.mjs';

const PAY='c7b5fa19-169f-4664-853c-fd69d6802fd4';
const QUOTE='ba238bc6-b3d9-4b19-9a13-8a0bbd31c13b';
const PAYER='f0a18d89-c454-4ad5-9e5a-a81f1d5c2a10';
const PRODUCT='PDC_'+'e'.repeat(24);
const KEY='t12e-http-intent-unique-2026';
const ORIGIN='https://sandbox.pdc.test';

function fixture({providerMode='success',directEnabled=true}={}){
  const count={orders:0,reservations:0,claims:0,provider:0,saved:0,unknown:0,smsIssuer:0};
  const states=new Map();
  const quote=quoteFromPrivateDb({quote_id:QUOTE,payer_id:PAYER,kind:'donation',
    amount_minor:'500',currency:'XAF',beneficiary_ids:[]});
  const pool={async query(sql){
    if(sql.includes('current_user'))return {rows:[{role_name:'pdc_tara_v5c_writer'}]};
    if(sql.includes('t12_v5c_claim_mobile_direct_dev')){
      count.claims++;
      if(states.get(KEY)!=='reserved')return {rows:[{ok:false}]};
      states.set(KEY,'requested');return {rows:[{ok:true}]};
    }
    if(sql.includes('t12_v5c_finish_mobile_direct_dev')){
      count.saved++;return {rows:[{ok:true}]};
    }
    if(sql.includes('t12_v5c_mark_mobile_unknown_dev')){
      count.unknown++;states.set(KEY,'unknown');return {rows:[{ok:true}]};
    }
    throw Error('T12E_TEST_UNKNOWN_SQL');
  }};
  const mobileClient={async initiate({productId,phoneNumber,amountXaf}){
    count.provider++;
    assert.equal(productId,PRODUCT);
    assert.equal(phoneNumber,'237699123456');
    assert.equal(amountXaf,'500');
    if(providerMode==='timeout')throw Error('simulated timeout');
    const success=providerMode==='success';
    return {productId,status:success?'request_initiated':'request_rejected',
      providerStatus:success?'SUCCESS':'FAILURE',
      providerMessage:success?'API_ORDER_SUCESSFULL':'ORDER_REJECTED',
      vendor:'MTN_CAMEROON',paymentConfirmed:false,membershipGranted:false};
  }};
  const orders={async create(raw){
    count.orders++;
    return {paymentId:PAY,quote,method:'mobile',messagingChannel:null,
      mobileMode:raw.mobileMode??'sms',mobilePhone:raw.mobilePhone??null,
      grossAmountXaf:'500',currency:'XAF',
      paymentConfirmed:false,membershipGranted:false};
  }};
  const taraReservations={async reserveCheckout({paymentId,quoteId,payerId,idempotencyKey,amountXaf}){
    count.reservations++;
    assert.equal(paymentId,PAY);assert.equal(quoteId,QUOTE);
    assert.equal(payerId,PAYER);assert.equal(idempotencyKey,KEY);
    assert.equal(amountXaf,'500');
    if(!states.has(KEY))states.set(KEY,'reserved');
    return {productId:PRODUCT,paymentId:PAY,quoteId:QUOTE,payerId:PAYER,
      idempotencyKey:KEY,amountXaf:'500',currency:'XAF',linkState:states.get(KEY)};
  }};
  const taraIssuer={async issue(){count.smsIssuer++;return {status:'manual_review'};}};
  const services={pool,mobileClient,orders,taraReservations,taraIssuer};
  return {count,states,services,async build(){
    const mobileDirect=directEnabled?await makePublicMobileDirectT12C({pool,mobileClient,
      webHookUrl:'https://example.org/tara-hook',phoneHmacKey:'a-static-test-only-key-not-used-in-deployment',
      enabled:true,environment:'sandbox'}):null;
    const coordinator=makePublicCheckoutCoordinatorV5C({orders,taraReservations,taraIssuer,
      issueLinks:true,mobileDirect,mobileDirectEnabled:directEnabled,
      createProductId:()=>PRODUCT,enabled:true,environment:'sandbox'});
    const server=createPublicOrderHttpV5C({repository:coordinator,
      enforceRateLimit:async()=>true,verifyHuman:async()=>true,
      allowedOrigins:[ORIGIN],resolveClientAddress:()=> '127.0.0.1',
      enabled:true,environment:'sandbox'});
    await new Promise((resolve,reject)=>{
      server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
    });
    return {server,url:`http://127.0.0.1:${server.address().port}/v1/public/orders`};
  }};
}
async function post(url,{mode='direct',origin=ORIGIN}={}){
  const result=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},
    body:JSON.stringify({verificationToken:'test-captcha-token-1234567890',
      order:{method:'mobile',mobileMode:mode,mobilePhone:mode==='direct'?'237699123456':null,
        idempotencyKey:KEY}})});
  return {code:result.status,body:await result.json()};
}
async function withServer(fixture,fn){
  const {server,url}=await fixture.build();
  try {await fn(url);}finally {await new Promise(resolve=>server.close(resolve));}
}

test('T12-E HTTP: SUCCESS => 202, productId maintenu et aucun encaissement',async()=>{
  const f=fixture();await withServer(f,async url=>{
    const {code,body}=await post(url);
    assert.equal(code,202);
    assert.equal(validateMobileDirectResponseT12(body).status,'request_initiated');
    assert.equal(body.productId,PRODUCT);
    assert.equal(body.paymentConfirmed,false);
    assert.equal(body.membershipGranted,false);
    assert.equal(Object.hasOwn(body,'paymentUrl'),false);
    assert.equal(Object.hasOwn(body,'transactionId'),false);
    assert.equal(f.count.orders,1);
    assert.equal(f.count.provider,1);
    assert.equal(f.count.smsIssuer,0);
    assert.equal(f.count.saved,1);
  });
});

test('T12-E HTTP: même référence ne produit jamais un second débit',async()=>{
  const f=fixture();await withServer(f,async url=>{
    assert.equal((await post(url)).body.status,'request_initiated');
    const retry=await post(url);
    assert.equal(retry.code,202);
    assert.equal(retry.body.status,'manual_review');
    assert.equal(f.count.provider,1);
    assert.equal(f.count.claims,1);
  });
});

test('T12-E HTTP: FAILURE fournisseur => refus provisoire, pas reçu',async()=>{
  const f=fixture({providerMode:'failure'});await withServer(f,async url=>{
    const {code,body}=await post(url);
    assert.equal(code,202);
    assert.equal(validateMobileDirectResponseT12(body).status,'request_rejected');
    assert.equal(body.paymentConfirmed,false);
    assert.equal(f.count.saved,1);
    assert.equal(f.count.provider,1);
  });
});

test('T12-E HTTP: timeout => manual_review, état unknown, aucun retry',async()=>{
  const f=fixture({providerMode:'timeout'});await withServer(f,async url=>{
    const {code,body}=await post(url);
    assert.equal(code,202);
    assert.equal(validateMobileDirectResponseT12(body).status,'manual_review');
    assert.equal(f.count.unknown,1);
    assert.equal(f.count.provider,1);
    assert.equal(f.count.smsIssuer,0);
  });
});

test('T12-E HTTP: direct interdit si désactivé, avant toute commande',async()=>{
  const f=fixture({directEnabled:false});await withServer(f,async url=>{
    const {code}=await post(url);
    assert.equal(code,503);
    assert.equal(f.count.orders,0);
    assert.equal(f.count.provider,0);
    assert.equal(f.count.reservations,0);
  });
});

test('T12-E HTTP: SMS conserve route historique et ne débite jamais directement',async()=>{
  const f=fixture();await withServer(f,async url=>{
    const {code,body}=await post(url,{mode:'sms'});
    assert.equal(code,202);
    assert.equal(body.status,'manual_review');
    assert.equal(f.count.smsIssuer,1);
    assert.equal(f.count.provider,0);
    assert.equal(f.count.claims,0);
  });
});

test('T12-E HTTP: origine étrangère rejetée avant toute écriture',async()=>{
  const f=fixture();await withServer(f,async url=>{
    const {code}=await post(url,{origin:'https://unauthorized.example'});
    assert.equal(code,403);
    assert.equal(f.count.orders,0);
    assert.equal(f.count.reservations,0);
    assert.equal(f.count.provider,0);
  });
});
