import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDiasporaMobileDirectR5T12} from '../src/r5/mobile-direct-r5-t12.mjs';
const UUID='c8d7a26a-84ab-4d36-a5f5-447f6a232f4e';
const PAY='cd74e6be-04a2-4469-ab12-a23b187c3852';
const PID='PDC_'+'x'.repeat(24);
const sessionToken='A'.repeat(43);
const input={orderId:UUID,sessionToken,method:'mobile',mobileMode:'direct',mobilePhone:'699 123 456',language:'fr'};
const cfg={environment:'sandbox',enabled:true,webHookUrl:'https://example.test/tara',
  phoneHmacKey:'this-test-only-secret-is-never-a-real-secret',createProductId:()=>PID};
function mock({state='reserved',claim=true,finish=true}={}){
  const calls=[],pool={async query(sql,params){calls.push({sql,params});
    if(sql.includes('current_user'))return {rows:[{role_name:'pdc_r5_intake_writer'}]};
    if(sql.includes('r5_reserve_tara_intent_dev'))return {rows:[{product_id:PID,payment_id:PAY,amount_xaf:'19680',link_state:state}]};
    if(sql.includes('r5_claim_mobile_direct_t12_dev'))return {rows:[{ok:claim}]};
    if(sql.includes('r5_finish_mobile_direct_t12_dev'))return {rows:[{ok:finish}]};
    if(sql.includes('r5_mark_mobile_direct_unknown_t12_dev'))return {rows:[{ok:true}]};
    throw Error('Unexpected SQL');
  }};return {pool,calls};
}
test('T12-B R5: SUCCESS stores launch not payment and uses reserved provider ID',async()=>{
  const {pool,calls}=mock();let debits=0;
  const service=await makeDiasporaMobileDirectR5T12({...cfg,pool,mobileClient:{async initiate(x){debits++;
    assert.equal(x.productId,PID);assert.equal(x.amountXaf,'19680');
    assert.equal(x.phoneNumber,'237699123456');return {status:'request_initiated',providerStatus:'SUCCESS',
      providerMessage:'API_ORDER_SUCESSFULL',vendor:'MTN_CAMEROON',productId:PID,paymentConfirmed:false,membershipGranted:false};}}});
  const result=await service.create(input);
  assert.equal(result.status,'request_initiated');assert.equal(result.paymentConfirmed,false);
  assert.equal(result.membershipGranted,false);assert.equal(debits,1);
  assert.ok(calls.some(x=>x.sql.includes('r5_finish_mobile_direct_t12_dev')));
  const claim=calls.find(x=>x.sql.includes('r5_claim_mobile_direct_t12_dev'));
  assert.equal(claim.params[4],'3456');assert.match(claim.params[3],/^[a-f0-9]{64}$/);
  assert.equal(calls.some(x=>JSON.stringify(x).includes('237699123456')),false);
});
test('T12-B R5: FAILURE is request rejected and payment stays pending',async()=>{
  const {pool}=mock();const service=await makeDiasporaMobileDirectR5T12({...cfg,pool,mobileClient:{async initiate(){return {
    status:'request_rejected',providerStatus:'FAILURE',providerMessage:'ORDER_REJECTED',
    productId:PID,paymentConfirmed:false,membershipGranted:false}}}});
  const r=await service.create(input);
  assert.equal(r.status,'request_rejected');assert.equal(r.paymentConfirmed,false);
});
test('T12-B R5: prior SMS or prior attempt does not issue another debit',async()=>{
  const {pool}=mock({state:'issued'});let count=0;
  const service=await makeDiasporaMobileDirectR5T12({...cfg,pool,mobileClient:{async initiate(){count++;}}});
  const r=await service.create(input);assert.equal(r.status,'manual_review');assert.equal(count,0);
});
test('T12-B R5: failure/timeout after claim invokes unknown state once',async()=>{
  const {pool,calls}=mock();let count=0;
  const service=await makeDiasporaMobileDirectR5T12({...cfg,pool,mobileClient:{async initiate(){count++;throw Error('timeout');}}});
  const r=await service.create(input);assert.equal(r.status,'manual_review');assert.equal(count,1);
  assert.ok(calls.some(x=>x.sql.includes('r5_mark_mobile_direct_unknown_t12_dev')));
});
test('T12-B R5: claim refused means no debit',async()=>{
  const {pool}=mock({claim:false});let count=0;
  const s=await makeDiasporaMobileDirectR5T12({...cfg,pool,mobileClient:{async initiate(){count++;}}});
  assert.equal((await s.create(input)).status,'manual_review');assert.equal(count,0);
});
test('T12-B R5: input validation rejects unsupported foreign or corrupted numbers',async()=>{
  const {pool}=mock();let count=0;
  const s=await makeDiasporaMobileDirectR5T12({...cfg,pool,mobileClient:{async initiate(){count++;}}});
  await assert.rejects(s.create({...input,mobilePhone:'+33612345678'}),/PHONE_INVALID/);
  await assert.rejects(s.create({...input,mobilePhone:'699 123 456',messagingChannel:'whatsapp'}),/INPUT_INVALID/);
  assert.equal(count,0);
});
