import test from 'node:test';
import assert from 'node:assert/strict';
import {allocationInBasisPoints, buildPublicOrderPayload,
  validatePublicCheckoutResponse} from '../src/features/payments/public-checkout-payload-v5c29.mjs';
const idempotencyKey='v5c29_test_20261028_abcdef';
const donor={nom:'Mbala',prenom:'Anne',email:'a@example.test',telephoneE164:'+237612345678',
  pays:'CM',montant:500,periodicite:'ponctuel',methode:'tara',messagerie:'whatsapp',
  affectation:'libre',repartition:null,anonymePublic:false};
const member={form:{type:'nouvelle',pays:'CM',nom:'Mbala',prenom:'Anne',email:'a@example.test',
  telephone:'612345678',civilite:'Madame',dateNaissance:'1990-05-01',lieuNaissance:'Yaoundé',
  categorie:'urbain',formule:'simple',modeCotisation:'aucun',demandeCarte:false,
  accepteStatuts:true,accepteDonnees:true},amounts:{totalImmediate:2000},
  methode:'mobile',messagerie:'whatsapp'};
const build=(source,data)=>buildPublicOrderPayload({source,data,idempotencyKey});
test('don direct : contrat exact et 500 FCFA brut, sans compte militant',()=>{
  const x=build('donation',donor);
  assert.equal(x.amountXaf,'500');assert.equal(x.messagingChannel,'whatsapp');
  assert.deepEqual(x.designations,[{purpose:'libre',percentBps:10000}]);
  assert.equal(x.donorDeclaration,true);
  assert.equal(x.apiKey,undefined);
});
test('adhésion CM 2000 XAF sans prix injecté par navigateur',()=>{
  const x=build('membership',member);
  assert.equal(x.kind,'initial_membership');assert.equal(x.amountXaf,undefined);
  assert.equal(x.phoneE164,'+237612345678');assert.equal(x.acceptedStatutes,true);
});
test('les parts ciblées couvrent exactement 10000 points de base',()=>{
  const parts=allocationInBasisPoints(1000,{scrutateurs:'333',cautionnements:'333',campagne:'334'});
  assert.equal(parts.reduce((s,x)=>s+x.percentBps,0),10000);
  assert.deepEqual(parts.map(x=>x.percentBps),[3330,3330,3340]);
});
test('petite fraction non représentable : refus, pas de perte silencieuse',()=>{
  assert.throws(()=>allocationInBasisPoints(1000000,{scrutateurs:1,campagne:999999}),/ALLOCATION_TOO_SMALL/);
});
test('don mensuel et anonymat public non activés',()=>{
  assert.throws(()=>build('donation',{...donor,periodicite:'mensuel'}),/MONTHLY_NOT_AVAILABLE/);
  assert.throws(()=>build('donation',{...donor,anonymePublic:true}),/ANONYMITY_NOT_YET_SUPPORTED/);
});
test('adhésion couple, diaspora, photo et cotisation simultanée non facturées à 2000 XAF',()=>{
  assert.throws(()=>build('membership',{...member,form:{...member.form,pays:'FR'}}),/MEMBERSHIP_SCOPE/);
  assert.throws(()=>build('membership',{...member,form:{...member.form,demandeCarte:true}}),/MEMBERSHIP_COMPLEX/);
  assert.throws(()=>build('membership',{...member,amounts:{totalImmediate:5000}}),/MEMBERSHIP_COMPLEX/);
});
test('réponse issued WhatsApp : domaine et canal corrects uniquement',()=>{
  const r={status:'issued',paymentId:'a91d4e12-937e-4891-8a58-33a8fc7ad317',
    currency:'XAF',grossAmountXaf:'500',paymentConfirmed:false,membershipGranted:false,
    linkField:'whatsappLink',paymentUrl:'https://wa.me/237612345678?text=test'};
  assert.equal(validatePublicCheckoutResponse(r,'tara','whatsapp').linkField,'whatsappLink');
  assert.throws(()=>validatePublicCheckoutResponse({...r,linkField:'generalLink'},'tara','whatsapp'));
  assert.throws(()=>validatePublicCheckoutResponse({...r,paymentUrl:'https://evil.test/x'},'tara','whatsapp'));
  assert.throws(()=>validatePublicCheckoutResponse({...r,paymentUrl:'https://taramoney.com/pay/123'},'tara','whatsapp'));
});
test('sans lien issued aucune URL cachée ne sort',()=>{
  const r={status:'manual_review',paymentId:'a91d4e12-937e-4891-8a58-33a8fc7ad317',currency:'XAF',
    grossAmountXaf:'2000',paymentConfirmed:false,membershipGranted:false};
  assert.equal(validatePublicCheckoutResponse(r,'mobile').status,'manual_review');
  assert.throws(()=>validatePublicCheckoutResponse({...r,paymentUrl:'https://wa.me/123'},'mobile'));
});
