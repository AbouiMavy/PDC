import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeMobilePayInputT12, parseMobilePayLaunchT12, makeTaraMobilePayClientT12
} from '../src/v5c/tara-mobilepay-client-t12.mjs';

const productId = 'PDC_' + 'x'.repeat(24);
const input = {
  productId, productName:'Cotisation PDC', amountXaf:'19680',
  phoneNumber:'237699123456', webHookUrl:'https://example.test/hooks/tara'
};
const config = {apiKey:'TEST_PRIVATE_API_KEY',businessId:'PDC_TEST',
  environment:'sandbox',allowNetwork:true};

test('T12: Cameroon direct input omits optional network', () => {
  const value = makeMobilePayInputT12(input);
  assert.equal(value.phoneNumber, '237699123456');
  assert.equal(value.productPrice, 19680);
  assert.equal(Object.hasOwn(value, 'network'), false);
});

test('T12: provider SUCCESS only means launch initiated, never paid', async () => {
  let calls = 0, sent;
  const client = makeTaraMobilePayClientT12({...config,fetchImpl:async(_url, req)=>{
    calls++; sent=JSON.parse(req.body);
    return {ok:true,text:async()=>JSON.stringify({
      message:'API_ORDER_SUCESSFULL',status:'SUCCESS',vendor:'ORANGE_CAMEROON'
    })};
  }});
  const result = await client.initiate(input);
  assert.equal(calls, 1);
  assert.equal(sent.productId, productId);
  assert.equal(sent.phoneNumber, input.phoneNumber);
  assert.equal(sent.apiKey, config.apiKey);
  assert.equal(Object.hasOwn(sent,'network'),false);
  assert.equal(result.status,'request_initiated');
  assert.equal(result.providerStatus,'SUCCESS');
  assert.equal(result.vendor,'ORANGE_CAMEROON');
  assert.equal(result.paymentConfirmed,false);
  assert.equal(result.membershipGranted,false);
});

test('T12: provider FAILURE returns rejected request, not confirmed payment', async()=>{
  const c=makeTaraMobilePayClientT12({...config,fetchImpl:async()=>({
    ok:true,text:async()=>JSON.stringify({message:'REQUEST_REJECTED',status:'FAILURE'})
  })});
  const r=await c.initiate(input);
  assert.equal(r.status,'request_rejected');
  assert.equal(r.paymentConfirmed,false);
});

test('T12: ambiguous network failure is unknown, no automatic retry', async()=>{
  let n=0;
  const c=makeTaraMobilePayClientT12({...config,fetchImpl:async()=>{n++;throw Error('timeout');}});
  await assert.rejects(c.initiate(input),/PDC_T12_PROVIDER_UNKNOWN_OUTCOME/);
  assert.equal(n,1);
});

test('T12: reject invalid phone, unsupported network, or amount',()=>{
  assert.throws(()=>makeMobilePayInputT12({...input,phoneNumber:'237599123456'}),/PHONE_INVALID/);
  assert.throws(()=>makeMobilePayInputT12({...input,network:'Wave'}),/NETWORK_INVALID/);
  assert.throws(()=>makeMobilePayInputT12({...input,amountXaf:'0'}),/AMOUNT_INVALID/);
  assert.throws(()=>makeMobilePayInputT12({...input,amountXaf:'19680.50'}),/AMOUNT_INVALID/);
});

test('T12: no provider connection unless explicitly sandbox enabled',()=>{
  assert.throws(()=>makeTaraMobilePayClientT12({...config,allowNetwork:false}),/DISABLED/);
  assert.deepEqual(Object.keys(parseMobilePayLaunchT12({
    status:'SUCCESS',message:'API_ORDER_SUCESSFULL',vendor:'MTN_CAMEROON'
  },productId)).includes('paymentConfirmed'),true);
});
