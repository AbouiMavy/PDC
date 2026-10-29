import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteFromPrivateDb,preparePrivateCheckout,V5CError} from '../src/v5c/contracts.mjs';
import {authorizeRenewalAccount} from '../src/v5c/renewals.mjs';
import {normalizeDonationDesignations} from '../src/v5c/donations.mjs';
import {planVerifiedPaymentTransition} from '../src/v5c/reconciliation.mjs';
import {recordUntrustedTaraClientHint,validateTaraSandboxMetadata} from '../src/v5c/tara-boundary.mjs';
import {makeVerifiedPaymentEventProcessor} from '../src/v5c/event-processor.mjs';

const UUIDS=[
'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
'33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'
];
const dbQuote=(override={})=>({quote_id:UUIDS[0],payer_id:UUIDS[1],kind:'couple_initial',currency:'EUR',amount_minor:'4000',beneficiary_ids:[UUIDS[2],UUIDS[3]],...override});
const pay=()=>({status:'pending',provider:'tara',providerPaymentId:'tara-reference-123',currency:'EUR',amountMinor:'4000'});
const evt=(status='confirmed')=>({status,providerPaymentId:'tara-reference-123',currency:'EUR',amountMinor:'4000'});
const rejects=(fn,code)=>assert.throws(fn,e=>e instanceof V5CError&&e.code===code);

test('C3 devise EUR, couple 40 EUR, deux bénéficiaires distincts',()=>{
 const q=quoteFromPrivateDb(dbQuote());
 assert.equal(q.amountMinor,'4000');assert.equal(q.beneficiaryIds.length,2);
 assert.ok(Object.isFrozen(q));assert.ok(Object.isFrozen(q.beneficiaryIds));
 const p=preparePrivateCheckout({quote:q,paymentId:UUIDS[0],provider:'tara',idempotencyKey:'checkout-safe-1234567'});
 assert.equal(p.state,'not_started');assert.equal(p.currency,'EUR');
});
test('C3 interdit de présenter une fausse ligne comme devis privé',()=>{
 rejects(()=>preparePrivateCheckout({quote:dbQuote(),paymentId:UUIDS[0],provider:'tara',idempotencyKey:'checkout-safe-1234567'}),'PDC_TRUSTED_QUOTE_REQUIRED');
});
for(const [field,override,code] of [
 ['montant', {amount_minor:'3999'},'PDC_COUPLE_BUNDLE_INVALID'],
 ['devise', {currency:'XAF'},'PDC_COUPLE_BUNDLE_INVALID'],
 ['doublon', {beneficiary_ids:[UUIDS[2],UUIDS[2]]},'PDC_BENEFICIARIES_DUPLICATE'],
 ['un seul dossier',{beneficiary_ids:[UUIDS[2]]},'PDC_COUPLE_BUNDLE_INVALID'],
 ['flottants',{amount_minor:40.0},'PDC_AMOUNT_INVALID'],
 ['très grand nombre',{amount_minor:'9999999999999999999'},'PDC_AMOUNT_INVALID']
]) test(`C3 refuse ${field}`,()=>rejects(()=>quoteFromPrivateDb(dbQuote(override)),code));
test('C3 requiert paiement ID et idempotence',()=>{
 const q=quoteFromPrivateDb(dbQuote());
 rejects(()=>preparePrivateCheckout({quote:q,paymentId:'nonsense',provider:'tara',idempotencyKey:'checkout-safe-1234567'}),'PDC_PAYMENT_ID_INVALID');
 rejects(()=>preparePrivateCheckout({quote:q,paymentId:UUIDS[0],provider:'stripe',idempotencyKey:'checkout-safe-1234567'}),'PDC_PROVIDER_INVALID');
 rejects(()=>preparePrivateCheckout({quote:q,paymentId:UUIDS[0],provider:'tara',idempotencyKey:'x'}),'PDC_IDEMPOTENCY_INVALID');
});
test('C1 devis individuels et dons doivent contenir le nombre attendu de bénéficiaires',()=>{
 const individual=quoteFromPrivateDb(dbQuote({kind:'individual_initial',currency:'XAF',amount_minor:'2000',beneficiary_ids:[UUIDS[2]]}));
 assert.equal(individual.amountMinor,'2000');
 const donation=quoteFromPrivateDb(dbQuote({kind:'donation',currency:'XAF',amount_minor:'500',beneficiary_ids:[]}));
 assert.equal(donation.beneficiaryIds.length,0);
 rejects(()=>quoteFromPrivateDb(dbQuote({kind:'donation',beneficiary_ids:[UUIDS[2]]})),'PDC_DONATION_BENEFICIARIES_INVALID');
});
test('C2 refuse renouvellement non authentifié ou non relié au bon militant',()=>{
 const dbLink={auth_user_id:UUIDS[0],membership_id:UUIDS[1],verified_at:'2026-10-27T10:00:00.000Z'};
 assert.deepEqual(authorizeRenewalAccount({verifiedAuthUserId:UUIDS[0],dbLink}),{membershipId:UUIDS[1]});
 rejects(()=>authorizeRenewalAccount({verifiedAuthUserId:UUIDS[2],dbLink}),'PDC_RENEWAL_AUTH_REQUIRED');
 rejects(()=>authorizeRenewalAccount({verifiedAuthUserId:UUIDS[0],dbLink:{...dbLink,verified_at:null}}),'PDC_RENEWAL_AUTH_REQUIRED');
 rejects(()=>authorizeRenewalAccount({verifiedAuthUserId:UUIDS[0],dbLink:null}),'PDC_RENEWAL_AUTH_REQUIRED');
});
test('C5 total répartition 100% avec entiers et refus des anomalies',()=>{
 const x=normalizeDonationDesignations([{purpose:'campagne',percentBps:6500},{purpose:'scrutateurs',percentBps:3500}]);
 assert.equal(x.reduce((a,b)=>a+b.percentBps,0),10000);
 rejects(()=>normalizeDonationDesignations([{purpose:'campagne',percentBps:7000}]),'PDC_DONATION_DESIGNATION_INVALID');
 rejects(()=>normalizeDonationDesignations([{purpose:'campagne',percentBps:10000},{purpose:'campagne',percentBps:1}]),'PDC_DONATION_DESIGNATION_INVALID');
 rejects(()=>normalizeDonationDesignations([{purpose:'libre',percentBps:5000},{purpose:'campagne',percentBps:5000}]),'PDC_DONATION_DESIGNATION_INVALID');
 rejects(()=>normalizeDonationDesignations([{purpose:'campagne',percentBps:100.5}]),'PDC_DONATION_DESIGNATION_INVALID');
});
for(const [before,eventStatus,action,status] of [
 ['initiated','pending','transition','pending'],
 ['initiated','confirmed','transition','confirmed'],
 ['pending','confirmed','transition','confirmed'],
 ['pending','failed','transition','failed'],
 ['pending','cancelled','transition','cancelled'],
 ['confirmed','refunded','transition','refunded'],
 ['confirmed','pending','stale','confirmed'],
 ['refunded','confirmed','stale','refunded'],
 ['confirmed','confirmed','duplicate','confirmed'],
 ['failed','confirmed','manual_review','failed'],
 ['refunded','failed','manual_review','refunded'],
]) test(`C5 statut ${before} + ${eventStatus} = ${action}`,()=>{
 assert.deepEqual(planVerifiedPaymentTransition({...pay(),status:before},evt(eventStatus)),{action,status});
});
test('C5 paiement de mauvaise devise, montant, référence sont toujours rejetés',()=>{
 for(const event of [{...evt(),currency:'XAF'},{...evt(),amountMinor:'4001'},{...evt(),providerPaymentId:'different'}])
   rejects(()=>planVerifiedPaymentTransition(pay(),event),'PDC_PAYMENT_RECONCILIATION_MISMATCH');
});
test('C4 callback Tara SUCCESS reste toujours non vérifié',()=>{
 const x=recordUntrustedTaraClientHint({reference:'ref123',status:'SUCCESS',amount:4000});
 assert.equal(x.status,'unverified');assert.equal(x.verification,'required');
 rejects(()=>recordUntrustedTaraClientHint({status:'SUCCESS'}),'PDC_TARA_CLIENT_REFERENCE_INVALID');
});
test('C4 sandbox requis pour les métadonnées SDK',()=>{
 const x=validateTaraSandboxMetadata({environment:'sandbox',businessId:'PDCDEV',publicApiKey:'PUB_TEST_KEY'});
 assert.equal(x.environment,'sandbox');assert.equal('publicApiKey' in x,false);
 rejects(()=>validateTaraSandboxMetadata({environment:'production',businessId:'PDCDEV',publicApiKey:'PUB_TEST_KEY'}),'PDC_TARA_SANDBOX_ONLY');
});
test('C4 aucun événement non vérifié n\'entre dans une transaction', async()=>{
 let touched=0;
 const processor=makeVerifiedPaymentEventProcessor({verifyProviderEvent:async()=>({verified:false}),withTransaction:async()=>{touched++;}});
 await assert.rejects(processor({rawBody:'{}',headers:{}}),/PDC_PROVIDER_PROOF_REQUIRED/);
 assert.equal(touched,0);
});
test('C5 événement authentifié répété = 1 seule mutation', async()=>{
 const seen=new Set();let updates=[];
 const verified={verified:true,provider:'tara',eventId:'evt-1',paymentId:UUIDS[0],...evt()};
 const p=makeVerifiedPaymentEventProcessor({
   verifyProviderEvent:async()=>verified,
   withTransaction:async fn=>fn({
     loadPaymentForUpdate:async()=>pay(),
     insertEventOnce:async ({eventId})=>{if(seen.has(eventId))return false;seen.add(eventId);return true;},
     updatePaymentStatus:async (...args)=>updates.push(args),
   }),
 });
 assert.equal((await p({rawBody:'{}'})).action,'transition');
 assert.equal((await p({rawBody:'{}'})).action,'replayed');
 assert.equal(updates.length,1);
 assert.equal(updates[0][1],'confirmed');
});
test('C5 refuses de traiter le JSON de taille excessive',async()=>{
 let called=false;
 const p=makeVerifiedPaymentEventProcessor({verifyProviderEvent:async()=>{called=true;},withTransaction:async()=>{}});
 await assert.rejects(p({rawBody:'x'.repeat(65537)}),/PDC_PAYMENT_EVENT_BODY_INVALID/);
 assert.equal(called,false);
});
