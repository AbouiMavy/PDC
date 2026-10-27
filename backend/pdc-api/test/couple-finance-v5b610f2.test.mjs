import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareCoupleFinanceDraft,createCouplePaymentInspector,COUPLE_PRICE_MINOR,COUPLE_CURRENCY} from '../src/couple-finance-v5b610f2.mjs';
const P='1903c0e5-3315-4cdc-9e13-2d01bfed2d49';
const A='bcb2a8fd-5148-497d-bd03-b5d7c385d91e';
const B='ee01e41d-b54c-48eb-a81e-d5c57c535d98';
const input=()=>({payerPersonId:P,memberApplicationId:A,partnerApplicationId:B});
const sql=readFileSync(new URL('../../../supabase/migrations/20261026001600_pdc_v5b610f2_couple_payment_bundle_dev.sql',import.meta.url),'utf8');
test('deux dossiers distincts et montant EUR fixé côté serveur',()=>{
  const d=prepareCoupleFinanceDraft(input());
  assert.equal(d.amountMinor,4000); assert.equal(d.currency,'EUR');
  assert.deepEqual(d.beneficiaries.map(b=>b.slot),['member','partner']);
  assert.equal(d.checkout,'not-enabled');assert.equal(d.admission,'not-enabled');
  assert.ok(Object.isFrozen(d));assert.ok(Object.isFrozen(d.beneficiaries));
});
test('les 40 EUR sont exprimés en centimes',()=>{assert.equal(COUPLE_PRICE_MINOR,4000);assert.equal(COUPLE_CURRENCY,'EUR');});
test('le paiement du couple ne crée pas deux prix individuels',()=>{
  assert.equal('obligation' in prepareCoupleFinanceDraft(input()),false);
});
test('UUID invalides interdits',()=>{
 for(const key of ['payerPersonId','memberApplicationId','partnerApplicationId'])
  assert.throws(()=>prepareCoupleFinanceDraft({...input(),[key]:'invalide'}),/PDC_COUPLE_IDENTIFIERS_INVALID/);
});
test('une demande ne peut représenter deux personnes',()=>{
 assert.throws(()=>prepareCoupleFinanceDraft({...input(),partnerApplicationId:A}),/PDC_COUPLE_DISTINCT_APPLICATIONS_REQUIRED/);
});
test('prix client 2000 rejeté',()=>assert.throws(()=>prepareCoupleFinanceDraft({...input(),quotedPriceMinor:2000}),/PDC_COUPLE_CLIENT_PRICE_MISMATCH/));
test('prix client numérique non convertible implicitement',()=>assert.throws(()=>prepareCoupleFinanceDraft({...input(),quotedPriceMinor:'4000'}),/PDC_COUPLE_CLIENT_PRICE_MISMATCH/));
test('devise étrangère rejetée',()=>assert.throws(()=>prepareCoupleFinanceDraft({...input(),quotedCurrency:'XAF'}),/PDC_COUPLE_CLIENT_CURRENCY_MISMATCH/));
test('adaptateur SQL absent interdit',()=>assert.throws(()=>createCouplePaymentInspector(),/PDC_COUPLE_SQL_ADAPTER_MISSING/));
test('inspection financière toujours paramétrée',async()=>{
 let calls=[];const x=createCouplePaymentInspector({query:async(...args)=>{calls.push(args);return {rows:[{verified:true}]};}});
 assert.equal(await x.isVerified(A),true);assert.deepEqual(calls[0][1],[A]);
 assert.match(calls[0][0],/\$1::uuid/);
});
test('UUID de commande incorrect interdit avant SQL',async()=>{
 let n=0;const x=createCouplePaymentInspector({query:async()=>{n++;return {rows:[{verified:false}]};}});
 await assert.rejects(x.isVerified('bad'),/PDC_COUPLE_ORDER_ID_INVALID/);assert.equal(n,0);
});
test('réponse SQL ambiguë refusée',async()=>{
 const x=createCouplePaymentInspector({query:async()=>({rows:[{verified:'true'}]})});
 await assert.rejects(x.isVerified(A),/PDC_COUPLE_VERIFICATION_UNAVAILABLE/);
});
test('migration maintient le blocage couple historique sans ALTER',()=>{
 assert.doesNotMatch(sql,/\b(?:ALTER|DROP)\s+FUNCTION\b/i);
 assert.doesNotMatch(sql,/\bALTER\s+TABLE\s+pdc_private\.membership_applications\b/i);
 assert.match(sql,/CREATE TABLE pdc_private\.couple_checkout_orders_v5b610f2/);
 assert.match(sql,/CREATE TABLE pdc_private\.couple_checkout_beneficiaries_v5b610f2/);
});
test('vérification du paiement vérifié, remboursement et deux dossiers',()=>{
 assert.match(sql,/e\.verified_at IS NOT NULL/);
 assert.match(sql,/p\.amount_minor=4000/);
 assert.match(sql,/count\(\*\).*pdc_private\.couple_checkout_beneficiaries_v5b610f2/is);
 assert.match(sql,/chargeback/);
});
test('anti double allocation SQL et verrou de paiement',()=>{
 assert.match(sql,/CREATE TRIGGER couple_no_double_allocation_v5b610f2/);
 assert.match(sql,/WHERE id=NEW\.payment_id FOR UPDATE/);
 assert.match(sql,/PDC_COUPLE_PAYMENT_ALREADY_RESERVED/);
 assert.match(sql,/CREATE FUNCTION pdc_private\.couple_no_double_allocation_v5b610f2\(\)\s+RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER/);
});
test('accès public et API restent révoqués',()=>{
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/g);
 assert.match(sql,/REVOKE ALL ON TABLE pdc_private\.couple_checkout_orders_v5b610f2/);
 assert.match(sql,/REVOKE ALL ON FUNCTION pdc_private\.couple_payment_verified_dev_v5b610f2/);
 assert.doesNotMatch(sql,/\bGRANT EXECUTE ON FUNCTION\b/i);
});
