import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quoteFromPrivateDb} from '../src/v5c/contracts.mjs';
import {makeTaraPublicIssuerV5C} from '../src/v5c/tara-public-issuer-v5c.mjs';
import {makePublicCheckoutCoordinatorV5C} from '../src/v5c/tara-public-checkout-coordinator-v5c.mjs';
import {createPublicOrderHttpV5C} from '../src/v5c/tara-public-order-http-v5c.mjs';
import {makeTaraSelectedChannelPgV5C} from '../src/v5c/tara-selected-channel-pg-v5c.mjs';
import {makeTaraServerClient} from '../src/v5c/tara-server-client-v5c.mjs';

const P='11111111-1111-4111-8111-111111111111';
const A='22222222-2222-4222-8222-222222222222';
const Q='33333333-3333-4333-8333-333333333333';
const KEY='public-order-xyz-123456';
const PID='PDC_'+'a'.repeat(24);
const LINKS={status:'SUCCESS',generalLink:'https://taramoney.com/pay/123456',
  cardLink:'https://taramoney.com/card/123456',
  whatsappLink:'https://wa.me/?text=payer',telegramLink:'https://t.me/share/url?url=valid',
  dikaloLink:'https://www.dklo.co/share/dikalo/123',smsLink:'https://www.dklo.co/share/sms/123'};
const SPECS=[['mobile',null,'smsLink'],['tara','whatsapp','whatsappLink'],
  ['tara','telegram','telegramLink'],['tara','dikalo','dikaloLink'],['carte',null,'cardLink']];
function fixture({method='mobile',messagingChannel=null,providerLinks=LINKS,
  failNetwork=false,failSave=false,claimSuccess=true,initialState='reserved',tamper=false,
  overrideTaraClient=null}={}) {
  const calls={sqlOrder:0,reserve:0,claim:0,provider:0,save:0,load:0,unknown:0};
  const quote=quoteFromPrivateDb({quote_id:Q,payer_id:A,kind:'donation',amount_minor:'500',
    currency:'XAF',beneficiary_ids:[]});
  const order={paymentId:P,quote,method,messagingChannel,grossAmountXaf:'500',
    currency:'XAF',paymentConfirmed:false,membershipGranted:false};
  const row={productId:PID,paymentId:P,quoteId:Q,payerId:A,
    idempotencyKey:KEY,amountXaf:'500',currency:'XAF',linkState:initialState};
  let saved=null;
  const orders={create:async()=>{calls.sqlOrder++;return order;}};
  const taraReservations={
    reserveCheckout:async()=>{calls.reserve++;return {...row};},
    claimLinkRequest:async()=>{calls.claim++;if(claimSuccess)row.linkState='requested';return claimSuccess;},
    markLinkUnknown:async()=>{calls.unknown++;row.linkState='unknown';return true;}
  };
  const channelStore={
    saveIssuedChannel:async(x)=>{calls.save++;if(failSave)throw Error('DB');
      assert.equal(x.paymentId,P);assert.equal(x.idempotencyKey,KEY);
      assert.equal(x.generalLink,LINKS.generalLink);
      saved={productId:PID,paymentId:P,method:x.method,
        messagingChannel:x.messagingChannel,linkField:x.linkField,paymentUrl:x.paymentUrl};
      row.linkState='issued';},
    loadIssuedChannel:async()=>{calls.load++;return tamper?{...saved,paymentUrl:'javascript:alert(1)'}:saved;}
  };
  const taraClient=overrideTaraClient??{createPaymentLink:async(input)=>{calls.provider++;
    assert.equal(input.productId,PID);assert.equal(input.amountXaf,'500');
    if(failNetwork)throw Error('network timeout');return providerLinks;}};
  const issuer=makeTaraPublicIssuerV5C({taraReservations,channelStore,taraClient,
    returnUrl:'https://pdc.example/return',webHookUrl:'https://pdc.example/hook',
    enabled:true,environment:'sandbox'});
  const service=makePublicCheckoutCoordinatorV5C({orders,taraReservations,
    createProductId:()=>PID,taraIssuer:issuer,issueLinks:true,enabled:true,environment:'sandbox'});
  const raw={method,idempotencyKey:KEY,...(messagingChannel?{messagingChannel}:{})};
  return {service,raw,calls,row,get saved(){return saved;}};
}

test('aucun accès fournisseur sans l activation explicite de l émetteur DEV',()=>{
  assert.throws(()=>makeTaraPublicIssuerV5C({}),/PUBLIC_ISSUER_DISABLED/);
  assert.throws(()=>makePublicCheckoutCoordinatorV5C({enabled:true,environment:'sandbox',
    orders:{create:async()=>{}},taraReservations:{reserveCheckout:async()=>{}},
    issueLinks:true}),/DEPENDENCY_INVALID/);
});
for(const [method,messagingChannel,field] of SPECS){
  test(`lien ${field} : une seule création, sauvegarde du canal, retry idempotent`,async()=>{
    const f=fixture({method,messagingChannel});
    const a=await f.service.create(f.raw);
    assert.equal(a.status,'issued');assert.equal(a.linkField,field);
    assert.equal(a.paymentUrl,LINKS[field]);assert.equal(a.grossAmountXaf,'500');
    assert.equal(a.paymentConfirmed,false);assert.equal(a.membershipGranted,false);
    assert.equal('generalLink' in a,false);
    assert.equal(f.saved.linkField,field);
    const b=await f.service.create(f.raw);
    assert.deepEqual(a,b);
    assert.equal(f.calls.provider,1);assert.equal(f.calls.claim,1);
    assert.equal(f.calls.save,1);assert.equal(f.calls.load,1);
    assert.equal(f.calls.sqlOrder,2);
  });
}

test('canal demandé absent : jamais de repli sur le lien général ni second appel',async()=>{
  const f=fixture({providerLinks:{...LINKS,smsLink:undefined}});
  assert.equal((await f.service.create(f.raw)).status,'manual_review');
  assert.equal(f.row.linkState,'unknown');
  assert.equal((await f.service.create(f.raw)).status,'manual_review');
  assert.equal(f.calls.provider,1);assert.equal(f.calls.save,0);
});
test('timeout fournisseur ambigu : revue humaine et aucun retry automatique',async()=>{
  const f=fixture({failNetwork:true});
  assert.equal((await f.service.create(f.raw)).status,'manual_review');
  assert.equal((await f.service.create(f.raw)).status,'manual_review');
  assert.equal(f.calls.provider,1);assert.equal(f.calls.unknown,1);
});
test('échec persistance après retour Tara : revue humaine, jamais un nouveau lien',async()=>{
  const f=fixture({failSave:true});
  assert.equal((await f.service.create(f.raw)).status,'manual_review');
  assert.equal((await f.service.create(f.raw)).status,'manual_review');
  assert.equal(f.calls.provider,1);assert.equal(f.calls.unknown,1);
});
test('claim concurrent perdu : aucun appel fournisseur',async()=>{
  const f=fixture({claimSuccess:false});
  assert.equal((await f.service.create(f.raw)).status,'manual_review');
  assert.equal(f.calls.provider,0);
});
test('reprise d un ancien issued uniquement généraliste : revue humaine',async()=>{
  const f=fixture({initialState:'issued'});
  assert.equal((await f.service.create(f.raw)).status,'manual_review');
  assert.equal(f.calls.provider,0);
});
test('reprise avec URL DB malveillante : aucune URL transmise',async()=>{
  const f=fixture({tamper:true});
  assert.equal((await f.service.create(f.raw)).status,'issued');
  const b=await f.service.create(f.raw);
  assert.equal(b.status,'manual_review');assert.equal('paymentUrl' in b,false);
  assert.equal(f.calls.provider,1);
});
test('HTTP public expose seulement le lien choisi et le brut, jamais generalLink',async()=>{
  const f=fixture({method:'tara',messagingChannel:'whatsapp'});
  const server=createPublicOrderHttpV5C({repository:f.service,allowedOrigins:['https://pdc.example'],
    verifyHuman:async()=>true,enforceRateLimit:async()=>true,
    enabled:true,environment:'sandbox'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const res=await fetch(`http://127.0.0.1:${server.address().port}/v1/public/orders`,
      {method:'POST',headers:{origin:'https://pdc.example','content-type':'application/json'},
       body:JSON.stringify({verificationToken:'test-human-token-123456',order:f.raw})});
    assert.equal(res.status,200);
    const out=await res.json();assert.equal(out.paymentUrl,LINKS.whatsappLink);
    assert.equal(out.linkField,'whatsappLink');
    assert.equal(out.grossAmountXaf,'500');assert.equal(out.paymentConfirmed,false);
    assert.equal('generalLink' in out,false);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('adaptateur SQL : rôle dédié, requêtes paramétrées seulement',async()=>{
  const calls=[];
  const pool={query:async(sql,params)=>{calls.push({sql,params});
    if(sql.startsWith('SELECT current_user'))return {rows:[{role_name:'pdc_tara_v5c_writer'}]};
    if(sql.includes('save_issued_channel'))return {rows:[{ok:true}]};
    return {rows:[{productId:PID,paymentId:P,method:'mobile',messagingChannel:null,
      linkField:'smsLink',paymentUrl:LINKS.smsLink}]};
  }};
  const repo=await makeTaraSelectedChannelPgV5C({pool,enabled:true,environment:'sandbox'});
  await repo.saveIssuedChannel({productId:PID,paymentId:P,idempotencyKey:KEY,
    method:'mobile',linkField:'smsLink',paymentUrl:LINKS.smsLink,generalLink:LINKS.generalLink});
  const row=await repo.loadIssuedChannel({productId:PID,idempotencyKey:KEY});
  assert.equal(row.linkField,'smsLink');assert.equal(calls.length,3);
  assert.equal(calls[1].params.length,8);assert.equal(calls[2].params.length,2);
  assert.ok(!calls[1].sql.includes(PID));
});
test('adaptateur SQL interdit les rôles autres que le writer privé',async()=>{
  const pool={query:async()=>({rows:[{role_name:'service_role'}]})};
  await assert.rejects(makeTaraSelectedChannelPgV5C({pool,enabled:true,environment:'sandbox'}),/ROLE_INVALID/);
});
test('HTTP direct refuse un lien externe même si le dépôt injecté est trompeur',async()=>{
  const server=createPublicOrderHttpV5C({repository:{create:async()=>({
    status:'issued',paymentId:P,productId:PID,grossAmountXaf:'500',currency:'XAF',
    paymentConfirmed:false,membershipGranted:false,linkField:'cardLink',
    paymentUrl:'https://evil.example/collect'})},allowedOrigins:['https://pdc.example'],
    verifyHuman:async()=>true,enforceRateLimit:async()=>true,
    enabled:true,environment:'sandbox'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const res=await fetch(`http://127.0.0.1:${server.address().port}/v1/public/orders`,
      {method:'POST',headers:{origin:'https://pdc.example','content-type':'application/json'},
      body:JSON.stringify({verificationToken:'test-human-token-123456',order:{}})});
    assert.equal(res.status,503);assert.equal((await res.json()).error,'TEMPORARILY_UNAVAILABLE');
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('V5C41 : montant 500 converti une seule fois par le vrai client Tara',async()=>{
  let calls=0;

  const client=makeTaraServerClient({
    apiKey:'test_sandbox_key_only',
    businessId:'PDC_TEST',
    environment:'sandbox',
    allowNetwork:true,
    fetchImpl:async(url,options)=>{
      calls++;
      assert.equal(url,'https://www.dklo.co/api/tara/paymentlinks');
      const body=JSON.parse(options.body);
      assert.equal(body.productPrice,500);
      assert.equal(body.productId,PID);
      assert.equal(body.businessId,'PDC_TEST');
      assert.equal(Object.hasOwn(body,'amountXaf'),false);
      assert.equal(Object.hasOwn(body,'environment'),false);
      return {
        ok:true,
        text:async()=>JSON.stringify(LINKS)
      };
    }
  });

  const f=fixture({overrideTaraClient:client});
  const first=await f.service.create(f.raw);

  assert.equal(first.status,'issued');
  assert.equal(first.linkField,'smsLink');
  assert.equal(first.paymentConfirmed,false);
  assert.equal(f.calls.save,1);
  assert.equal(calls,1);

  const retry=await f.service.create(f.raw);
  assert.deepEqual(retry,first);
  assert.equal(calls,1);
});
