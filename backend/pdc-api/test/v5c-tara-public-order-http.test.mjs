import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPublicOrderHttpV5C} from '../src/v5c/tara-public-order-http-v5c.mjs';
const origin='https://www.pdc.example';
const id='11111111-1111-4111-8111-111111111111';
const okOrder={paymentId:id,currency:'XAF',grossAmountXaf:'500',
  paymentConfirmed:false,membershipGranted:false};
async function fixture({allow=true,human=true,result=okOrder}={}) {
  const calls={rate:0,human:0,create:0};
  const server=createPublicOrderHttpV5C({enabled:true,environment:'sandbox',
    allowedOrigins:[origin],
    enforceRateLimit:async()=>{calls.rate++;return allow;},
    verifyHuman:async()=>{calls.human++;return human;},
    repository:{create:async()=>{calls.create++;return result;}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${server.address().port}/v1/public/orders`,calls,
    close:()=>new Promise(resolve=>server.close(resolve))};
}
const post=(f,body,headers={})=>fetch(f.url,{method:'POST',headers:{origin,
  'content-type':'application/json',...headers},body:JSON.stringify(body)});
const body={verificationToken:'demo-human-token-12345',order:{kind:'donation'}};
test('fermé par défaut et aucun anti-abus optionnel',()=>{
  assert.throws(()=>createPublicOrderHttpV5C({}),/PDC_PUBLIC_HTTP_DISABLED/);
  assert.throws(()=>createPublicOrderHttpV5C({enabled:true,environment:'sandbox'}),/DEPENDENCY_INVALID/);
});
test('refuse les origines inconnues avant lecture / persistance',async()=>{
  const f=await fixture();try {
    const r=await fetch(f.url,{method:'POST',headers:{origin:'https://evil.example',
      'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal(r.status,403);assert.equal(f.calls.create,0);assert.equal(f.calls.rate,0);
  }finally{await f.close();}
});
test('limitation de débit avant vérification et écriture',async()=>{
  const f=await fixture({allow:false});try {
    const r=await post(f,body);assert.equal(r.status,429);
    assert.equal(f.calls.rate,1);assert.equal(f.calls.human,0);assert.equal(f.calls.create,0);
  }finally{await f.close();}
});
test('preuve humaine obligatoire avant SQL',async()=>{
  const f=await fixture({human:false});try {
    const r=await post(f,body);assert.equal(r.status,403);
    assert.equal(f.calls.human,1);assert.equal(f.calls.create,0);
  }finally{await f.close();}
});
test('aucun jeton CAPTCHA dans l’objet persistant',async()=>{
  const f=await fixture();try {
    const r=await post(f,body);assert.equal(r.status,201);
    assert.deepEqual(await r.json(),{
      status:'pending_payment_setup',paymentId:id,grossAmountXaf:'500',currency:'XAF',
      paymentConfirmed:false,membershipGranted:false});
    assert.equal(f.calls.create,1);
  }finally{await f.close();}
});
test('ne transforme pas une réponse SQL douteuse en paiement confirmé',async()=>{
  const f=await fixture({result:{...okOrder,paymentConfirmed:true}});try {
    const r=await post(f,body);assert.equal(r.status,503);
    assert.equal((await r.json()).error,'TEMPORARILY_UNAVAILABLE');
  }finally{await f.close();}
});
test('rejette un montant / forme de JSON hors contrat, même avec CAPTCHA valide',async()=>{
  const f=await fixture();try {
    for(const payload of [{...body,order:null},{...body,price:999},[]]){
      const r=await post(f,payload);assert.equal(r.status,400);}
    assert.equal(f.calls.create,0);
  }finally{await f.close();}
});
test('méthodes interdites et aucun lien Tara ouvert',async()=>{
  const f=await fixture();try {
    const r=await fetch(f.url,{method:'GET',headers:{origin}});
    assert.equal(r.status,405);assert.equal(f.calls.create,0);
  }finally{await f.close();}
});
