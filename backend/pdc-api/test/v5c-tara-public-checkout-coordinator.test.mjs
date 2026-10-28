import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteFromPrivateDb } from '../src/v5c/contracts.mjs';
import { makePublicCheckoutCoordinatorV5C } from '../src/v5c/tara-public-checkout-coordinator-v5c.mjs';
import { createPublicOrderHttpV5C } from '../src/v5c/tara-public-order-http-v5c.mjs';

const P='11111111-1111-4111-8111-111111111111';
const A='22222222-2222-4222-8222-222222222222';
const Q='33333333-3333-4333-8333-333333333333';
const key='public-order-xyz-123456';
const productId='PDC_'+'a'.repeat(24);
const quote=(kind='donation')=>quoteFromPrivateDb({quote_id:Q,payer_id:A,
  kind,amount_minor:'500',currency:'XAF',beneficiary_ids:kind==='donation'?[]:[A]});
const raw={idempotencyKey:key,method:'mobile'};

function fixture({method='mobile',messagingChannel=null,kind='donation',
  initialLinkState='reserved',badAmount=false,badRow=false,failReservation=false}={}) {
  const log=[], stored=new Map();
  const inputQuote=quote(kind);
  const order={paymentId:P,quote:inputQuote,method,messagingChannel,
    grossAmountXaf:badAmount?'900':'500',currency:'XAF',paymentConfirmed:false,membershipGranted:false};
  const orders={async create(){log.push('SQL_CREATE_PUBLIC_ORDER');return order;}};
  const taraReservations={async reserveCheckout(v){
    log.push('SQL_RESERVE_TARA');
    if(failReservation)throw Error('DB offline - secret info');
    if(!stored.has(v.idempotencyKey)) stored.set(v.idempotencyKey,
      {...v,linkState:initialLinkState,generalLink:null});
    return badRow?{...stored.get(v.idempotencyKey),amountXaf:'600'}:stored.get(v.idempotencyKey);
  }};
  const service=makePublicCheckoutCoordinatorV5C({orders,taraReservations,
    createProductId:()=>productId,enabled:true,environment:'sandbox'});
  return {service,log,stored};
}

test('configuration fermée par défaut ; interfaces privées obligatoires',()=>{
  assert.throws(()=>makePublicCheckoutCoordinatorV5C({}),/COORDINATOR_DISABLED/);
  assert.throws(()=>makePublicCheckoutCoordinatorV5C({enabled:true,environment:'production'}),/COORDINATOR_DISABLED/);
  assert.throws(()=>makePublicCheckoutCoordinatorV5C({enabled:true,environment:'sandbox'}),/DEPENDENCY_INVALID/);
});

test('don Mobile Money : écrit d abord la commande, ensuite réserve le productId',async()=>{
  const x=fixture();const result=await x.service.create(raw);
  assert.deepEqual(x.log,['SQL_CREATE_PUBLIC_ORDER','SQL_RESERVE_TARA']);
  assert.deepEqual(result,{status:'reserved_channel_pending',paymentId:P,
    grossAmountXaf:'500',currency:'XAF',paymentConfirmed:false,membershipGranted:false});
  assert.equal(x.stored.get(key).amountXaf,'500');
  assert.equal(x.stored.get(key).quoteId,Q);
  assert.equal(x.stored.get(key).payerId,A);
  assert.equal(x.stored.get(key).productId,productId);
});

test('WhatsApp : référence réservée mais aucun URL générique ni message envoyé',async()=>{
  const x=fixture({method:'tara',messagingChannel:'whatsapp'});
  const result=await x.service.create({...raw,method:'tara',messagingChannel:'whatsapp'});
  assert.equal(result.status,'reserved_channel_pending');
  assert.equal('generalLink' in result,false);
  assert.equal('paymentUrl' in result,false);
  assert.equal('productId' in result,false);
  assert.deepEqual(x.log,['SQL_CREATE_PUBLIC_ORDER','SQL_RESERVE_TARA']);
});

test('Telegram : même interdiction du lien généraliste',async()=>{
  const x=fixture({method:'tara',messagingChannel:'telegram'});
  assert.equal((await x.service.create({...raw,method:'tara',messagingChannel:'telegram'})).status,
    'reserved_channel_pending');
});

test('carte Tara : reservation via cardLink dans la prochaine etape',async()=>{
  const x=fixture({method:'carte'});
  const result=await x.service.create({...raw,method:'carte'});
  assert.equal(result.status,'reserved_channel_pending');
  assert.deepEqual(x.log,['SQL_CREATE_PUBLIC_ORDER','SQL_RESERVE_TARA']);
});

test('virement bancaire : aucune réservation Tara',async()=>{
  const x=fixture({method:'virement'});
  assert.equal((await x.service.create({...raw,method:'virement'})).status,'pending_external_payment');
  assert.deepEqual(x.log,['SQL_CREATE_PUBLIC_ORDER']);
});

test('reprise idempotente : la même clé réutilise la réservation',async()=>{
  const x=fixture();const r1=await x.service.create(raw);const r2=await x.service.create(raw);
  assert.deepEqual(r1,r2);assert.equal(x.stored.size,1);
  assert.equal(x.log.filter(x=>x==='SQL_RESERVE_TARA').length,2);
});

test('lien ancien ou requête incertaine : revue manuelle, sans nouveau lien',async()=>{
  for (const initialLinkState of ['issued','requested','unknown','cancelled']){
    const x=fixture({initialLinkState});const r=await x.service.create(raw);
    assert.equal(r.status,'manual_review');assert.equal('paymentUrl' in r,false);
  }
});

test('refus du montant SQL différent de la quote privée',async()=>{
  const x=fixture({badAmount:true});
  await assert.rejects(x.service.create(raw),/COORDINATOR_ORDER_INVALID/);
  assert.deepEqual(x.log,['SQL_CREATE_PUBLIC_ORDER']);
});

test('refus d une réservation SQL incohérente',async()=>{
  const x=fixture({badRow:true});
  await assert.rejects(x.service.create(raw),/COORDINATOR_RESERVATION_INVALID/);
});

test('échec SQL de réservation : jamais de deuxième prestataire ou de paiement déclaré',async()=>{
  const x=fixture({failReservation:true});
  await assert.rejects(x.service.create(raw));
  assert.deepEqual(x.log,['SQL_CREATE_PUBLIC_ORDER','SQL_RESERVE_TARA']);
});

test('la quote non brandée ne peut pas réserver de produit',async()=>{
  const x=fixture();const untrusted={...quote()};
  const orders={create:async()=>({paymentId:P,quote:untrusted,method:'mobile',messagingChannel:null,
    grossAmountXaf:'500',currency:'XAF',paymentConfirmed:false,membershipGranted:false})};
  let called=false;
  const taraReservations={reserveCheckout:async()=>{called=true;}};
  const c=makePublicCheckoutCoordinatorV5C({orders,taraReservations,
    enabled:true,environment:'sandbox'});
  await assert.rejects(c.create(raw),/TRUSTED_QUOTE_REQUIRED/);
  assert.equal(called,false);
});

test('HTTP intégré : 201, état de réservation, aucune URL ou clé Tara',async()=>{
  const x=fixture();const origin='https://pdc.example.org';
  const server=createPublicOrderHttpV5C({repository:x.service,
    verifyHuman:async()=>true,enforceRateLimit:async()=>true,
    allowedOrigins:[origin],enabled:true,environment:'sandbox'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const url=`http://127.0.0.1:${server.address().port}/v1/public/orders`;
    const res=await fetch(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},
      body:JSON.stringify({verificationToken:'test-human-token-12345',order:raw})});
    assert.equal(res.status,201);
    const data=await res.json();assert.equal(data.status,'reserved_channel_pending');
    assert.equal(data.paymentConfirmed,false);assert.equal(data.grossAmountXaf,'500');
    assert.equal('paymentUrl' in data,false);assert.equal('productId' in data,false);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('HTTP : réservation ambiguë retourne 202 revue humaine sans encaissement',async()=>{
  const x=fixture({initialLinkState:'unknown'});
  const origin='https://pdc.example.org';
  const server=createPublicOrderHttpV5C({repository:x.service,
    verifyHuman:async()=>true,enforceRateLimit:async()=>true,
    allowedOrigins:[origin],enabled:true,environment:'sandbox'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const res=await fetch(`http://127.0.0.1:${server.address().port}/v1/public/orders`,
      {method:'POST',headers:{origin,'Content-Type':'application/json'},
       body:JSON.stringify({verificationToken:'test-human-token-12345',order:raw})});
    assert.equal(res.status,202);assert.equal((await res.json()).status,'manual_review');
  }finally{await new Promise(resolve=>server.close(resolve));}
});
