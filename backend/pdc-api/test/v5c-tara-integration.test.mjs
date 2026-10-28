import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quoteFromPrivateDb} from '../src/v5c/contracts.mjs';
import {prepareTaraCheckoutDraft} from '../src/v5c/tara-checkout-v5c.mjs';
import {makeTaraLinkInput,makeTaraServerClient,parseTaraLinkResponse,
  parseTaraMobileStatus,parseTaraTransactionRows,validateTaraProductId,newTaraProductId} from '../src/v5c/tara-server-client-v5c.mjs';
import {inspectUntrustedTaraWebhook} from '../src/v5c/tara-webhook-v5c.mjs';
import {evaluateTaraEvidence,reconcileTaraProduct} from '../src/v5c/tara-reconciliation-v5c.mjs';

const productId='PDCV5C_TEST_20261027_A';
const businessId='pdc_demo_business';
const origin='https://pdc-portail.vercel.app';
const item={productId,expectedAmountXaf:'5000',paymentChannel:'mobile'};
const mobile={productId,status:'SUCCESS'};
const paid={transactionId:productId,status:'PAID',amount:'5000',currency:'XAF'};
const hint={trusted:false,productId,amount:'5000',status:'SUCCESS'};
const linkArgs={productId,productName:'Cotisation PDC',productDescription:'Operation PDC sans nom',
  amountXaf:'5000',returnUrl:`${origin}/adhesion/merci`,webHookUrl:'https://api-pdc.example.org/tara/webhook'};
const paymentLink={status:'success',generalLink:'https://taramoney.com/pay/example_abc',cardLink:'https://taramoney.com/card/example_xyz'};
const idA='11111111-1111-4111-8111-111111111111';
const idB='22222222-2222-4222-8222-222222222222';
const idC='33333333-3333-4333-8333-333333333333';
const quote=quoteFromPrivateDb({quote_id:idA,payer_id:idB,kind:'individual_initial',amount_minor:'5000',currency:'XAF',beneficiary_ids:[idC]});
const fakeClient=(answers)=>({
  checkMobileStatus:async()=>answers.mobile??mobile,
  listTransactions:async({start,size})=>answers.list(start,size),
});
function mockTaraFetch(responses) {
  const requests=[];
  const fetchImpl=async(url,config)=>{
    requests.push({url,config});
    const answer=responses[url];
    if(answer instanceof Error)throw answer;
    return {ok:true,text:async()=>JSON.stringify(answer)};
  };
  return {fetchImpl,requests};
}

// Contrat de productId = transactionId (Tara) et de paymentId distinct.
test('productId serveur aléatoire et unique',()=>{
  const a=newTaraProductId(),b=newTaraProductId();
  assert.notEqual(a,b);
  assert.equal(validateTaraProductId(a),a);
});
test('productId obligatoire, jamais fourni aléatoirement par Tara',()=>{
  assert.equal(validateTaraProductId(productId),productId);
  for (const id of ['', 'a', 'contient espace', '../escape', 'échec', null])
    assert.throws(()=>validateTaraProductId(id),/PDC_TARA_PRODUCT_ID_INVALID/);
});
test('lien : montant XAF et champs exactement documentés',()=>{
  assert.deepEqual(makeTaraLinkInput(linkArgs),{
    productId,productName:'Cotisation PDC',productPrice:5000,
    productDescription:'Operation PDC sans nom',returnUrl:linkArgs.returnUrl,
    webHookUrl:linkArgs.webHookUrl,
  });
});
test('lien : refuse montant fractionnaire, nul, négatif ou devises implicites',()=>{
  for(const amountXaf of ['0','2.5','-1','1e4',4000000000,'01',5000])
    assert.throws(()=>makeTaraLinkInput({...linkArgs,amountXaf}),/PDC_TARA_PRICE_INVALID/);
});
test('lien : returnUrl et webhookUrl doivent être HTTPS non local',()=>{
  for(const url of ['http://pdc.cm/ok','https://localhost/ok','https://127.0.0.1/ok','https://u:p@pdc.cm/a','https://pdc.cm/a#frag'])
    assert.throws(()=>makeTaraLinkInput({...linkArgs,webHookUrl:url}),/PDC_TARA_URL_INVALID/);
});
test('lien : ne laisse sortir que liens prestataire HTTPS documentés',()=>{
  assert.deepEqual(parseTaraLinkResponse(paymentLink),{
    generalLink:'https://taramoney.com/pay/example_abc',cardLink:'https://taramoney.com/card/example_xyz'});
  assert.throws(()=>parseTaraLinkResponse({status:'success',generalLink:'https://evil.example/pay'}),/PDC_TARA_PAYMENT_LINK_INVALID/);
  assert.throws(()=>parseTaraLinkResponse({status:'success',generalLink:'http://taramoney.com/pay/x'}),/PDC_TARA_PAYMENT_LINK_INVALID/);
  assert.throws(()=>parseTaraLinkResponse({status:'failed',generalLink:'https://taramoney.com/pay/x'}),/PDC_TARA_LINK_NOT_CREATED/);
});
test('sandbox + permission explicite obligatoires même avec mock réseau',()=>{
  for(const config of [{environment:'production',allowNetwork:true},{environment:'sandbox',allowNetwork:false},{}])
    assert.throws(()=>makeTaraServerClient({apiKey:'sandbox_key',businessId,...config}),/PDC_TARA_NETWORK_DISABLED/);
});
test('appels Tara utilisent POST, JSON, identifiants privés, sans passer par React',async()=>{
  const responses={
    'https://www.dklo.co/api/tara/paymentlinks':paymentLink,
    'https://www.dklo.co/api/tara/transactions/status':mobile,
    'https://www.dklo.co/api/tara/transactionlist':[paid],
  };
  const {fetchImpl,requests}=mockTaraFetch(responses);
  const client=makeTaraServerClient({apiKey:'test_api_secret',businessId,environment:'sandbox',allowNetwork:true,fetchImpl});
  assert.deepEqual(await client.createPaymentLink(linkArgs),parseTaraLinkResponse(paymentLink));
  assert.deepEqual(await client.checkMobileStatus(productId),mobile);
  assert.deepEqual(await client.listTransactions({start:0,size:20}),[paid]);
  assert.equal(requests.length,3);
  for(const req of requests){
    const body=JSON.parse(req.config.body);
    assert.equal(req.config.method,'POST');
    assert.equal(req.config.redirect,'error');
    assert.equal(body.apiKey,'test_api_secret');
    assert.equal(body.businessId,businessId);
    assert.equal(req.config.headers['Content-Type'],'application/json');
  }
  assert.equal(JSON.parse(requests[0].config.body).productPrice,5000);
  assert.equal(JSON.parse(requests[1].config.body).productId,productId);
  assert.deepEqual([JSON.parse(requests[2].config.body).start,JSON.parse(requests[2].config.body).size],[0,20]);
});
test('refus sécurisé des erreurs fournisseur : pas de fuite des secrets',async()=>{
  const {fetchImpl}=mockTaraFetch({'https://www.dklo.co/api/tara/transactions/status':new Error('test_api_secret leaked!')});
  const c=makeTaraServerClient({apiKey:'test_api_secret',businessId,environment:'sandbox',allowNetwork:true,fetchImpl});
  await assert.rejects(()=>c.checkMobileStatus(productId),e=>e.code==='PDC_TARA_PROVIDER_UNAVAILABLE' && !e.message.includes('secret'));
});
test('statut mobile : productId exact, pas une preuve de montant',()=>{
  assert.deepEqual(parseTaraMobileStatus(mobile,productId),mobile);
  assert.throws(()=>parseTaraMobileStatus({...mobile,productId:'PDC_FAUX_ID'},productId),/PDC_TARA_STATUS_INVALID/);
});
test('liste : mapping transactionId/productId en XAF',()=>{
  assert.deepEqual(parseTaraTransactionRows([{...paid,amount:5000}]),[paid]);
  assert.throws(()=>parseTaraTransactionRows([{...paid,amount:2.5}]),/PDC_TARA_TRANSACTION_ROW_INVALID/);
  assert.throws(()=>parseTaraTransactionRows({items:[paid]}),/PDC_TARA_LIST_INVALID/);
});
test('liste : pagination bornée',async()=>{
  const {fetchImpl}=mockTaraFetch({'https://www.dklo.co/api/tara/transactionlist':[]});
  const c=makeTaraServerClient({apiKey:'test_api_secret',businessId,environment:'sandbox',allowNetwork:true,fetchImpl});
  for(const param of [{start:-1,size:20},{start:0,size:0},{start:0,size:201},{start:0,size:1.4}])
    await assert.rejects(()=>c.listTransactions(param),/PDC_TARA_PAGINATION_INVALID/);
});
test('webhook Mobile Money : normalisation non fiable et pas de téléphone',()=>{
  const raw=JSON.stringify({businessId,paymentId:'tara_pay_123',productId,amount:'5000',
    collectionId:'27731',phoneNumber:'611111111',creationDate:'2025-07-02T14:13:53.888+02:00',
    changeDate:'2025-07-02T14:13:53.088+02:00',status:'SUCCESS'});
  const h=inspectUntrustedTaraWebhook(raw,businessId);
  assert.equal(h.trusted,false);
  assert.equal(h.paymentId,'tara_pay_123');
  assert.equal(h.productId,productId);
  assert.equal(h.status,'SUCCESS');
  assert.equal('phoneNumber' in h,false);
  assert.equal(h.eventId.length,64);
  assert.equal(h.eventId,inspectUntrustedTaraWebhook(raw,businessId).eventId);
});
test('webhook carte : numéro de téléphone facultatif',()=>{
  const raw=JSON.stringify({businessId,paymentId:'tara_pay_123',productId,amount:'5000',collectionId:'27731',status:'SUCCESS'});
  assert.equal(inspectUntrustedTaraWebhook(raw,businessId).verification,'required');
});
test('webhook : compte marchand non attendu => rejet',()=>{
  const raw=JSON.stringify({businessId:'wrong',paymentId:'pay',productId,amount:'5000',collectionId:'27731',status:'SUCCESS'});
  assert.throws(()=>inspectUntrustedTaraWebhook(raw,businessId),/PDC_TARA_WEBHOOK_INVALID/);
});
test('webhook : JSON, taille et données invalides rejetés',()=>{
  for(const raw of ['oops','{}','x'.repeat(65540)])
    assert.throws(()=>inspectUntrustedTaraWebhook(raw,businessId),/PDC_TARA_WEBHOOK_INVALID/);
});
test('corroboration : statut SUCCESS + liste PAID, productId et montant XAF identiques',()=>{
  assert.deepEqual(evaluateTaraEvidence({...item,mobileStatus:mobile,transactionRows:[paid],webhookHint:hint}),{
    decision:'corroborated',productId,amountXaf:'5000',currency:'XAF',
    source:'TARA_STATUS_AND_TRANSACTION_LIST',requiresAtomicDbReconciliation:true});
});
test('un webhook SUCCESS seul ne confirme aucun paiement',()=>{
  assert.equal(evaluateTaraEvidence({...item,mobileStatus:mobile,transactionRows:[],webhookHint:hint}).decision,'not_verified');
});
test('une transaction PAID seule ne confirme pas sans statut serveur',()=>{
  assert.equal(evaluateTaraEvidence({...item,mobileStatus:null,transactionRows:[paid]}).decision,'not_verified');
});
test('montant ou devise différents => revue humaine',()=>{
  for(const x of [{...paid,amount:'4999'},{...paid,currency:'EUR'}]){
    assert.deepEqual(evaluateTaraEvidence({...item,mobileStatus:mobile,transactionRows:[x]}),{
      decision:'manual_review',reason:'FINANCIAL_MISMATCH',productId});
  }
});
test('transactionId différent de productId => non vérifié',()=>{
  assert.equal(evaluateTaraEvidence({...item,mobileStatus:mobile,transactionRows:[{...paid,transactionId:'OTHER_TRANSACTION'}]}).decision,'not_verified');
});
test('duplicata transactionId détecté même si les montants sont identiques',()=>{
  assert.deepEqual(evaluateTaraEvidence({...item,mobileStatus:mobile,transactionRows:[paid,paid]}),{
    decision:'manual_review',reason:'DUPLICATE_TRANSACTION_ID',productId});
});
test('statuts PENDING ou FAILED ne deviennent jamais confirmed',()=>{
  for(const pair of [{ms:'PENDING',ps:'PAID'},{ms:'SUCCESS',ps:'PENDING'},{ms:'FAILED',ps:'FAILED'}])
    assert.equal(evaluateTaraEvidence({...item,mobileStatus:{productId,status:pair.ms},transactionRows:[{...paid,status:pair.ps}]}).decision,'not_verified');
});
test('webhook en conflit avec montant réel => revue humaine',()=>{
  assert.deepEqual(evaluateTaraEvidence({...item,mobileStatus:mobile,transactionRows:[paid],webhookHint:{...hint,amount:'4000'}}),{
    decision:'manual_review',reason:'WEBHOOK_CONFLICT',productId});
});
test('carte bancaire : aucune prétention de couverture par le statut mobile',()=>{
  assert.deepEqual(evaluateTaraEvidence({...item,paymentChannel:'card',mobileStatus:mobile,transactionRows:[paid]}),{
    decision:'manual_review',reason:'CHANNEL_NOT_VERIFIED',productId});
});
test('rapprochement : trouve la transaction sur la seconde page et attend fin de pagination',async()=>{
  const seen=[];const c=fakeClient({list:(start,size)=>{seen.push({start,size});return start===0?[{...paid,transactionId:'OTHER_ID_1'},{...paid,transactionId:'OTHER_ID_2'}]:[paid]}});
  const d=await reconcileTaraProduct({...item,client:c,pageSize:2,maxPages:3});
  assert.equal(d.decision,'corroborated');assert.deepEqual(seen,[{start:0,size:2},{start:2,size:2}]);
});
test('pagination incomplète refuse corroboration sur ensemble non exhaustif',async()=>{
  const c=fakeClient({list:(start)=>start===0?[paid]:[{...paid,transactionId:'ANOTHER_ID'}]});
  const d=await reconcileTaraProduct({...item,client:c,pageSize:1,maxPages:2});
  assert.deepEqual(d,{decision:'manual_review',reason:'PAGINATION_INCOMPLETE',productId});
});
test('rapprochement : refuse client de configuration invalide',async()=>{
  await assert.rejects(()=>reconcileTaraProduct({...item,client:null}),/PDC_TARA_RECONCILIATION_CONFIG_INVALID/);
});
test('dossier checkout XAF issu uniquement de la quote privée',()=>{
  const d=prepareTaraCheckoutDraft({quote,paymentId:idA,idempotencyKey:'idempotency_ABCDEF123',productId,
    returnUrl:linkArgs.returnUrl,webHookUrl:linkArgs.webHookUrl});
  assert.equal(d.taraInput.productPrice,5000);
  assert.equal(d.productId,productId);
  assert.equal(d.persisted,false);
  assert.equal(d.paymentConfirmed,false);
});
test('aucun checkout basé sur une quote arbitraire du navigateur',()=>{
  assert.throws(()=>prepareTaraCheckoutDraft({quote:{...quote},paymentId:idA,idempotencyKey:'idempotency_ABCDEF123',productId,
    returnUrl:linkArgs.returnUrl,webHookUrl:linkArgs.webHookUrl}),/PDC_TRUSTED_QUOTE_REQUIRED/);
});
test('couple diaspora 40 EUR : pas de lien Tara avant confirmation devise',()=>{
  const couple=quoteFromPrivateDb({quote_id:idA,payer_id:idB,kind:'couple_initial',amount_minor:'4000',currency:'EUR',beneficiary_ids:[idB,idC]});
  assert.throws(()=>prepareTaraCheckoutDraft({quote:couple,paymentId:idA,idempotencyKey:'idempotency_ABCDEF123',productId,
    returnUrl:linkArgs.returnUrl,webHookUrl:linkArgs.webHookUrl}),/PDC_TARA_EUR_NOT_DOCUMENTED/);
});


test('Tara reelle : statut SUCCESS majuscule', async () => {
  const raw = {
    status: 'SUCCESS',
    generalLink: 'https://taramoney.com/pay/123456789'
  };
  const {fetchImpl} = mockTaraFetch({
    'https://www.dklo.co/api/tara/paymentlinks': raw
  });
  const client = makeTaraServerClient({
    apiKey: 'test_api_secret',
    businessId,
    environment: 'sandbox',
    allowNetwork: true,
    fetchImpl
  });
  assert.deepEqual(
    await client.createPaymentLink(linkArgs),
    {generalLink: raw.generalLink}
  );
});
