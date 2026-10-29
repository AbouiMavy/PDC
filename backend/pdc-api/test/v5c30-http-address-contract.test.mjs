import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPublicOrderHttpV5C} from '../src/v5c/tara-public-order-http-v5c.mjs';
import {makeTrustedClientAddressV5C30} from '../src/v5c/trusted-client-address-v5c30.mjs';
const origin='https://dev.example.test';
async function fixture(){
  let db=0,rate=0,human=0;
  const server=createPublicOrderHttpV5C({enabled:true,environment:'sandbox',allowedOrigins:[origin],
    resolveClientAddress:makeTrustedClientAddressV5C30(),
    enforceRateLimit:async()=>{rate++;return true;},
    verifyHuman:async()=>{human++;return true;},
    repository:{create:async()=>{db++;return {paymentId:'11111111-1111-4111-8111-111111111111',
      grossAmountXaf:'500',currency:'XAF',paymentConfirmed:false,membershipGranted:false};}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${server.address().port}/v1/public/orders`,
    stats:()=>({db,rate,human}),close:()=>new Promise(resolve=>server.close(resolve))};
}
const body=JSON.stringify({verificationToken:'demo-human-token-12345',order:{kind:'donation'}});
const post=(url,headers={})=>fetch(url,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body});
test('XFF forgé refuse avant limiteur/CAPTCHA/SQL',async()=>{
  const f=await fixture();try{
    const r=await post(f.url,{'x-forwarded-for':'203.0.113.2'});
    assert.equal(r.status,403);assert.equal((await r.json()).error,'CLIENT_ADDRESS_UNTRUSTED');
    assert.deepEqual(f.stats(),{db:0,rate:0,human:0});
  }finally{await f.close();}
});
test('connexion directe locale sans XFF passe le filtre réseau',async()=>{
  const f=await fixture();try{
    const r=await post(f.url);assert.equal(r.status,201);
    assert.deepEqual(f.stats(),{db:1,rate:1,human:1});
    assert.equal((await r.json()).paymentConfirmed,false);
  }finally{await f.close();}
});

test('proxy unique local : l adresse validée est celle du visiteur, non du proxy',async()=>{
  const observed=[];
  const server=createPublicOrderHttpV5C({enabled:true,environment:'sandbox',allowedOrigins:[origin],
    resolveClientAddress:makeTrustedClientAddressV5C30({mode:'single-proxy',trustedPeers:['127.0.0.1']}),
    enforceRateLimit:async({address})=>{observed.push(address);return false;},
    verifyHuman:async()=>{throw Error('unexpected');},
    repository:{create:async()=>{throw Error('unexpected');}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/v1/public/orders`;
  try{
    assert.equal((await post(url,{'x-forwarded-for':'198.51.100.10'})).status,429);
    assert.equal((await post(url,{'x-forwarded-for':'198.51.100.11'})).status,429);
    assert.deepEqual(observed,['198.51.100.10','198.51.100.11']);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
