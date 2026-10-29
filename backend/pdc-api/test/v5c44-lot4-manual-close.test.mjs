import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decideManualTaraReviewV5C44} from '../src/v5c/tara-manual-decision-v5c44.mjs';
import {makePendingReceiptV5C44,readPendingReceiptV5C44}
  from '../../../src/features/payments/manual-receipt-v5c44.mjs';
const id='PDC_'+'a'.repeat(24);
const raw={productId:id,expectedAmountXaf:'500',observedAmountXaf:'500',
  observedCurrency:'XAF',observedStatus:'PAID',referenceMatches:true};
const receipt={paymentId:'00000000-0000-4000-8000-000000000001',
  grossAmountXaf:'500',currency:'XAF',status:'issued',productId:id,
  paymentConfirmed:false,membershipGranted:false};
test('V5C44.4 : preuve manuelle positive ne confirme jamais à elle seule',()=>{
  const out=decideManualTaraReviewV5C44(raw);
  assert.equal(out.decision,'matched_for_operator_confirmation');
  assert.equal(out.paymentConfirmed,false);
});
test('V5C44.4 : différence de montant, devise, identifiant contestées',()=>{
  for(const changes of [{observedAmountXaf:'501'},{observedCurrency:'EUR'},
    {referenceMatches:false}])
    assert.equal(decideManualTaraReviewV5C44({...raw,...changes}).decision,'disputed');
});
test('V5C44.4 : paiement non final ne déclenche pas la clôture',()=>{
  for(const observedStatus of ['PENDING','FAILED','CANCELLED','UNKNOWN'])
    assert.equal(decideManualTaraReviewV5C44({...raw,observedStatus}).decision,'awaiting_payment');
});
test('V5C44.4 : données ou devises inconnues sont rejetées',()=>{
  for(const changes of [{observedAmountXaf:'-1'},{expectedAmountXaf:'0.5'},
    {observedCurrency:'USD'},{referenceMatches:'yes'}])
    assert.throws(()=>decideManualTaraReviewV5C44({...raw,...changes}),/INVALID/);
});
test('V5C44.4 : l’accusé de réception n’est pas une preuve de paiement',()=>{
  const r=makePendingReceiptV5C44('donation',receipt);
  assert.equal(r.stage,'awaiting_manual_verification');
  assert.equal(r.paymentConfirmed,false);
  assert.equal(r.productId,id);
  assert.equal(r.membershipGranted,false);
  const restored=readPendingReceiptV5C44({pdcReceipt:r},'donation');
  assert.deepEqual(restored,r);
  assert.equal(readPendingReceiptV5C44({pdcReceipt:r},'membership'),null);
  assert.throws(()=>makePendingReceiptV5C44('membership',
    {...receipt,paymentConfirmed:true}),/INVALID/);
});
test('V5C44.4 : pas d’octroi automatique depuis le navigateur',()=>{
  const component=readFileSync(new URL('../../../src/components/PaymentMethods/PendingManualReceiptV5C44.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(component,/fetch\s*\(|localStorage|sessionStorage/);
  assert.match(component,/pas l.encaissement du paiement/);
});
test('V5C44.4 : SQL interdit à tous les rôles runtime et privilégie transaction atomique',()=>{
  const sql=readFileSync(new URL('../../../supabase/migrations/20261029004440_pdc_v5c444_manual_review_dev.sql',import.meta.url),'utf8');
  assert.match(sql,/SECURITY INVOKER/);
  assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*?pdc_tara_v5c_writer/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/payment_events/);
  assert.match(sql,/audit_log/);
  assert.match(sql,/confirmed_at/);
  assert.doesNotMatch(sql,/GRANT EXECUTE .* TO (?:anon|authenticated|service_role|pdc_tara_v5c_writer)/);
});
