import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePublicOrderRequest} from '../src/v5c/tara-public-order-preparation-v5c.mjs';
const base={kind:'donation',idempotencyKey:'t12g-order-digest-00001',firstName:'Anne',
  lastName:'Exemple',email:'anne@example.org',phoneE164:'+33612345678',
  country:'FR',method:'mobile',amountXaf:'500',donorDeclaration:true,
  designations:[{purpose:'libre',percentBps:10000}]};
test('T12-G: SMS conserve empreinte historique sans nouveau champ',()=>{
  const old=preparePublicOrderRequest(base);
  const sms=preparePublicOrderRequest({...base,mobileMode:'sms'});
  assert.equal(old.requestDigest,sms.requestDigest);
});
test('T12-G: residence France, portefeuille Senegal et Wave, devise XAF',()=>{
  const p=preparePublicOrderRequest({...base,mobileMode:'direct',mobileCountry:'SN',
    mobileNetwork:'Wave',mobilePhone:'771234567'});
  assert.equal(p.country,'FR');assert.equal(p.mobileCountry,'SN');
  assert.equal(p.mobilePhone,'221771234567');assert.equal(p.mobileNetwork,'Wave');
  assert.equal(p.grossAmountXaf,'500');assert.equal(p.currency,'XAF');
  assert.equal(p.paymentConfirmed,false);
});
test('T12-G: meme cle, digests differents pour reseau et pays de portefeuille',()=>{
  const sn={...base,mobileMode:'direct',mobileCountry:'SN',mobilePhone:'771234567'};
  const noWave=preparePublicOrderRequest(sn);
  const wave=preparePublicOrderRequest({...sn,mobileNetwork:'Wave'});
  const cm=preparePublicOrderRequest({...sn,mobileCountry:'CM',mobilePhone:'699123456'});
  assert.notEqual(noWave.requestDigest,wave.requestDigest);
  assert.notEqual(noWave.requestDigest,cm.requestDigest);
});
test('T12-G: pays/numero incompatibles et reseau interdit rejetes avant SQL',()=>{
  for(const x of [
    {...base,mobileMode:'direct',mobileCountry:'CM',mobilePhone:'+221771234567'},
    {...base,mobileMode:'direct',mobileCountry:'CM',mobilePhone:'699123456',mobileNetwork:'Wave'},
    {...base,mobileMode:'sms',mobileCountry:'SN'},
    {...base,method:'carte',mobileNetwork:'Wave'}
  ])assert.throws(()=>preparePublicOrderRequest(x),/PAYMENT_CHANNEL_INVALID/);
});
