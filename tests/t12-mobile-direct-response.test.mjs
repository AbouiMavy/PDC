import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMobileDirectResponseT12} from '../src/features/payments/mobile-direct-response-t12.mjs';
const base={status:'request_initiated',paymentId:'c8d7a26a-84ab-4d36-a5f5-447f6a232f4e',
  productId:'PDC_'+'x'.repeat(24),grossAmountXaf:'19680',currency:'XAF',
  paymentConfirmed:false,membershipGranted:false,providerStatus:'SUCCESS',
  providerMessage:'API_ORDER_SUCESSFULL',vendor:'ORANGE_CAMEROON'};
test('T12-B: direct request is not a confirmed payment',()=>{
 const r=validateMobileDirectResponseT12(base);
 assert.equal(r.status,'request_initiated');assert.equal(r.paymentConfirmed,false);
 assert.equal(Object.hasOwn(r,'paymentUrl'),false);
});
test('T12-B: rejects premature confirmation, links, and provider mismatches',()=>{
 for(const edit of [{paymentConfirmed:true},{membershipGranted:true},
   {linkField:'smsLink'},{paymentUrl:'https://taramoney.com/pay/123'},
   {providerStatus:'FAILURE'},{productId:'bad'}])
   assert.throws(()=>validateMobileDirectResponseT12({...base,...edit}),/INVALID_DIRECT_RESPONSE/);
});
test('T12-B: manual review never impersonates success',()=>{
 const r=validateMobileDirectResponseT12({...base,status:'manual_review',providerStatus:null,
   providerMessage:null,vendor:null});
 assert.equal(r.status,'manual_review');assert.equal(r.paymentConfirmed,false);
});
