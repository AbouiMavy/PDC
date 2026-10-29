import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createTaraCheckoutHttpApp } from '../src/v5c/tara-checkout-http-v5c.mjs';

const ID='11111111-1111-4111-8111-111111111111';
const ORIGIN='https://pdc.example.org';
const payload={paymentId:ID,idempotencyKey:'pdc-safe-attempt-000001'};
const paymentUrl='https://taramoney.com/pay/mock-link';
const fixtures = ({review=false}={}) => {
  const seen=[];const quote={testOnly:true};
  const deps={
    verifyUser:async token=>{seen.push(['verifyUser',token]);return {id:ID};},
    loadAuthorizedCheckout:async arg=>{seen.push(['loadAuthorizedCheckout',arg]);return {quote,paymentId:arg.paymentId};},
    service:{initiate:async arg=>{seen.push(['initiate',arg]);return review ? {status:'manual_review',productId:'PDC_'+'x'.repeat(24)} : {status:'issued',productId:'PDC_'+'x'.repeat(24),generalLink:paymentUrl};}},
    allowedOrigins:[ORIGIN],enabled:true,environment:'sandbox',
  };return {seen,quote,deps};
};
async function withServer(deps,callback) {
  const server=createTaraCheckoutHttpApp(deps);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try {return await callback('http://127.0.0.1:'+server.address().port);} finally {
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
}
function post(url,body=payload,options={}) {
  return fetch(url+'/v1/tara/checkouts',{
    method:'POST',headers:{Origin:ORIGIN,Authorization:'Bearer test_secure_token',
      'Content-Type':'application/json',...options.headers},
    body:JSON.stringify(body),redirect:'error'});
}
test('désactivé par défaut et en production',()=>{
  for(const args of [{}, {...fixtures().deps,environment:'production'}, {...fixtures().deps,enabled:false}])
    assert.throws(()=>createTaraCheckoutHttpApp(args),/HTTP_DISABLED/);
});
test('réussite : source privée vérifiée, montant jamais fourni par navigateur',async()=>{
  const f=fixtures();await withServer(f.deps,async url=>{
    const response=await post(url);assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{status:'issued',productId:'PDC_'+'x'.repeat(24),paymentUrl,paymentConfirmed:false});
    assert.equal(response.headers.get('cache-control'),'no-store');
  });
  assert.deepEqual(f.seen.map(x=>x[0]),['verifyUser','loadAuthorizedCheckout','initiate']);
  assert.deepEqual(f.seen[1][1],{userId:ID,paymentId:ID});
  assert.strictEqual(f.seen[2][1].quote,f.quote);
});
test('prix, devise, payeur et quote injectés refusés',async()=>{
  const f=fixtures();await withServer(f.deps,async url=>{
    const r=await post(url,{...payload,amount:1,currency:'XAF',payerId:ID});
    assert.equal(r.status,400);
  });
  assert.equal(f.seen.filter(x=>x[0]==='initiate').length,0);
});
test('aucun appel métier si origine ou bearer manquant',async()=>{
  const f=fixtures();await withServer(f.deps,async url=>{
    const forbidden=await post(url,payload,{headers:{Origin:'https://evil.example'}});
    assert.equal(forbidden.status,403);
    const unauthorized=await post(url,payload,{headers:{Authorization:''}});
    assert.equal(unauthorized.status,401);
  });assert.equal(f.seen.length,0);
});
test('paiement inconnu ne produit pas de lien',async()=>{
  const f=fixtures();f.deps.loadAuthorizedCheckout=async()=>null;
  await withServer(f.deps,async url=>assert.equal((await post(url)).status,404));
  assert.equal(f.seen.filter(x=>x[0]==='initiate').length,0);
});
test('état ambigu : aucun lien annoncé, pas de confirmation',async()=>{
  const f=fixtures({review:true});await withServer(f.deps,async url=>{
    const r=await post(url);assert.equal(r.status,202);
    assert.deepEqual(await r.json(),{status:'manual_review',productId:'PDC_'+'x'.repeat(24),paymentConfirmed:false});
  });
});
test('erreur backend ne révèle pas de secret',async()=>{
  const f=fixtures();f.deps.service.initiate=async()=>{throw new Error('API_KEY_SECRET');};
  await withServer(f.deps,async url=>{
    const r=await post(url);assert.equal(r.status,503);
    assert.equal(JSON.stringify(await r.json()).includes('API_KEY_SECRET'),false);
  });
});
