import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparePublicOrderRequest } from '../src/v5c/tara-public-order-preparation-v5c.mjs';

const base = {kind:'donation',idempotencyKey:'public-9a7c36f82f4b1',firstName:'Anne',lastName:'Exemple',
  email:'Anne@example.org',phoneE164:'+237699123456',country:'CM',method:'mobile',
  amountXaf:'500',donorDeclaration:true,designations:[{purpose:'libre',percentBps:10000}]};
const member = {kind:'initial_membership',idempotencyKey:'member-9a7c36f82f4b1',
  firstName:'Paul',lastName:'Exemple',email:'paul@example.org',phoneE164:'+237699123456',
  country:'CM',method:'mobile',acceptedStatutes:true,acceptedDataNotice:true,
  civility:'Monsieur',dob:'1990-02-13',birthPlace:'Yaoundé',memberCategory:'urbain'};

test('don public 500 FCFA sans compte utilisateur',()=>{
  const x=preparePublicOrderRequest(base);
  assert.equal(x.grossAmountXaf,'500');assert.equal(x.currency,'XAF');
  assert.equal(x.kind,'donation');assert.equal(x.paymentConfirmed,false);
  assert.equal('userId' in x,false);
});
test('première adhésion au Cameroun: prix serveur fixe 2000 XAF',()=>{
  const x=preparePublicOrderRequest(member);
  assert.equal(x.grossAmountXaf,'2000');assert.equal(x.kind,'individual_initial');
  assert.equal(x.membershipGranted,false);
});
test('prix navigateur interdit pour adhésion',()=>{
  assert.throws(()=>preparePublicOrderRequest({...member,amountXaf:'1'}),/MEMBERSHIP_INVALID/);
});
test('référence de requête non réutilisable pour autre montant',()=>{
  const a=preparePublicOrderRequest(base);const b=preparePublicOrderRequest({...base,amountXaf:'501'});
  assert.notEqual(a.requestDigest,b.requestDigest);
});
test('frais prestataire jamais ajoutés à la contribution brute',()=>{
  const x=preparePublicOrderRequest(base);
  assert.equal(x.grossAmountXaf,'500');assert.equal('fee' in x,false);
});
test('saisie invalide et champs inconnus rejetés',()=>{
  for(const field of [{...base,apiKey:'private'}, {...base,amountXaf:'50'},
    {...base,amountXaf:'500.2'},{...base,idempotencyKey:'short'},
    {...base,designations:[{purpose:'libre',percentBps:5000}]}])
    assert.throws(()=>preparePublicOrderRequest(field));
});
test('option de messagerie seulement sur le mode Tara',()=>{
  assert.throws(()=>preparePublicOrderRequest({...base,messagingChannel:'telegram'}),/CHANNEL_INVALID/);
  const r=preparePublicOrderRequest({...base,method:'tara',messagingChannel:'telegram'});
  assert.equal(r.messagingChannel,'telegram');
});
test('aucune conversion implicite EUR et aucun montant couple ajouté',()=>{
  assert.throws(()=>preparePublicOrderRequest({...member,country:'FR'}),/MEMBERSHIP_INVALID/);
  assert.throws(()=>preparePublicOrderRequest({...member,memberCategory:'couple'}),/MEMBERSHIP_INVALID/);
});
test('identifiants malformés et naissance impossible rejetés',()=>{
  assert.throws(()=>preparePublicOrderRequest({...member,dob:'1990-02-31'}));
  assert.throws(()=>preparePublicOrderRequest({...member,firstName:'<script>'}));
});
