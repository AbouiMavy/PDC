import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preparePublicOrderRequest} from '../src/v5c/tara-public-order-preparation-v5c.mjs';
import {xafQuoteFromEuroCents} from '../src/v5c/tara-rate-quote-r4.mjs';
const base={kind:'initial_membership',idempotencyKey:'r4-test-member-order-2026',
  firstName:'Camille',lastName:'Test',email:'test@example.com',phoneE164:'+237699000001',
  country:'CM',method:'carte',dob:'1990-03-02',birthPlace:'Obala',civility:'Madame',
  memberCategory:'rural_etudiant',acceptedStatutes:true,acceptedDataNotice:true};
test('R4 initial seulement 2000 XAF et cotisation nulle',()=>{
 const o=preparePublicOrderRequest({...base,annualMode:'aucun',annualPaymentXaf:'0'});
 assert.equal(o.grossAmountXaf,'2000');assert.equal(o.membership.annualPaymentXaf,'0');
});
test('R4 cotisation partielle et totale dans une seule commande',()=>{
 assert.equal(preparePublicOrderRequest({...base,annualMode:'partiel',annualPaymentXaf:'1000'}).grossAmountXaf,'3000');
 assert.equal(preparePublicOrderRequest({...base,annualMode:'total',annualPaymentXaf:'5000'}).grossAmountXaf,'7000');
});
test('R4 serveur refuse prix artificiel et versement supérieur au barème',()=>{
 for(const amount of ['5001','-1','2.5','59999','05000'])assert.throws(
  ()=>preparePublicOrderRequest({...base,annualMode:'partiel',annualPaymentXaf:amount}),
  /PDC_PUBLIC_MEMBERSHIP_INVALID/);
 assert.throws(()=>preparePublicOrderRequest({...base,annualMode:'aucun',annualPaymentXaf:'5000'}),
  /PDC_PUBLIC_MEMBERSHIP_INVALID/);
});
test('R4 arrondi supérieur par multiple 5 ou 10, sans taux inventé',()=>{
 assert.equal(xafQuoteFromEuroCents({euroCents:'4000',rateMilliXafPerEur:'655957',roundToXaf:10}).providerAmountXaf,'26240');
 assert.equal(xafQuoteFromEuroCents({euroCents:'3000',rateMilliXafPerEur:'655957',roundToXaf:5}).providerAmountXaf,'19680');
 assert.throws(()=>xafQuoteFromEuroCents({euroCents:'4000',rateMilliXafPerEur:'1'}),/PDC_R4_FX_RATE_NOT_APPROVED/);
});
test('R4 SQL: 2 allocations bornees, paiement unique et SQL privé',()=>{
 const sql=readFileSync(new URL('../../../supabase/migrations/20261029004510_pdc_v5c45_annual_shared_checkout_dev.sql',import.meta.url),'utf8');
 assert.match(sql,/annual_paid_xaf/);assert.match(sql,/WHEN v_kind='individual_initial' THEN 2000/);
 assert.match(sql,/v_target.n NOT IN \(1,2\)/);assert.match(sql,/v_annual_id,v_annual_paid/);
 // La création de commande et la réservation ne doivent JAMAIS confirmer un paiement.
 // L'unique UPDATE confirmed appartient à la procédure distincte de contrôle HUMAIN.
 const manualMarker='CREATE OR REPLACE FUNCTION pdc_private.tara_v5c44_confirm_manual_payment_dev(';
 const manualOffset=sql.indexOf(manualMarker);
 assert.ok(manualOffset>0,'fonction de confirmation manuelle introuvable');
 const confirmationUpdate=/UPDATE\s+pdc_private\.payment_attempts\s+SET\s+status\s*=\s*'confirmed'/i;
 assert.doesNotMatch(sql.slice(0,manualOffset),confirmationUpdate);
 const manualEnd=sql.indexOf('\n$fn$;',manualOffset);
 assert.ok(manualEnd>manualOffset,'fin de procédure manuelle introuvable');
 const manual=sql.slice(manualOffset,manualEnd);
 assert.match(manual,confirmationUpdate);
 assert.match(manual,/p_explicit_confirmation IS DISTINCT FROM/);
 assert.match(manual,/PDC_MANUAL_CONFIRMATION_REQUIRED/);
 assert.match(manual,/v_review\.evidence_origin IS DISTINCT FROM 'merchant_dashboard'/);
 assert.match(manual,/v_alloc_sum<>v_pay\.amount_minor/);
 assert.match(manual,/v_alloc_count NOT IN \(1,2\)/);
 assert.equal((sql.match(new RegExp(confirmationUpdate.source,'gi'))||[]).length,1,
   'une seule fonction peut confirmer le paiement');
});

test('R4 préserve le canal general de V5-C.42',()=>{
 const sql=readFileSync(new URL('../../../supabase/migrations/20261029004510_pdc_v5c45_annual_shared_checkout_dev.sql',import.meta.url),'utf8');
 assert.match(sql,/v_channel NOT IN \('general','whatsapp','telegram','dikalo'\)/);
 assert.doesNotMatch(sql,/v_channel NOT IN \('whatsapp','telegram','dikalo'\)/);
});
