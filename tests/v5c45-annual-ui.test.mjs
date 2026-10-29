import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPublicOrderPayload} from '../src/features/payments/public-checkout-payload-v5c29.mjs';
const f={type:'nouvelle',pays:'CM',formule:'simple',nom:'Mbala',prenom:'Anne',email:'a@example.test',
 telephone:'612345678',civilite:'Madame',dateNaissance:'1990-05-01',lieuNaissance:'Yaoundé',
 categorie:'rural_etudiant',demandeCarte:false,accepteStatuts:true,accepteDonnees:true};
const make=(overrides,amounts)=>buildPublicOrderPayload({source:'membership',
 idempotencyKey:'v5c45_test_20261029_abcdef',data:{form:{...f,...overrides},
 amounts:{totalImmediate:amounts},methode:'mobile'}});
test('R4 UI expose un versement annuel partiel sans piloter le tarif serveur',()=>{
 const a=make({modeCotisation:'partiel',versementPartiel:'1000'},3000);
 assert.equal(a.annualMode,'partiel');assert.equal(a.annualPaymentXaf,'1000');
 assert.equal(a.amountXaf,undefined);
});
test('R4 UI accepte cotisation totale et refuse montant falsifié',()=>{
 const a=make({modeCotisation:'total'},7000);
 assert.equal(a.annualPaymentXaf,'5000');
 assert.throws(()=>make({modeCotisation:'total'},2000),/INVALID_ANNUAL_PAYMENT/);
});
test('R4 conserve les verrous anonymat et photographie prépaiement',()=>{
 assert.throws(()=>make({modeCotisation:'aucun',demandeCarte:true},2000),/CARD_PHOTO_PUBLIC_UPLOAD_NOT_READY/);
});
