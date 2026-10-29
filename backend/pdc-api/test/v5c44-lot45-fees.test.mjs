import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkManualTaraFeesV5C445 as check}
  from '../src/v5c/tara-manual-fees-v5c445.mjs';
const input={grossXaf:'500',netXaf:'424',feeXaf:'76',expectedGrossXaf:'500',currency:'XAF'};
test('44.5 : brut 500, net 424, frais 76 => cohérence arithmétique, jamais confirmation',()=>{
  const r=check(input);
  assert.equal(r.decision,'fees_consistent_for_manual_review');
  assert.equal(r.paymentConfirmed,false);
  assert.deepEqual([r.grossXaf,r.netXaf,r.feeXaf],['500','424','76']);
});
test('44.5 : aucune règle tarifaire fixe ni coût inventé',()=>{
  assert.equal(check({...input,netXaf:'480',feeXaf:'20'}).decision,'fees_consistent_for_manual_review');
  assert.equal(check({...input,netXaf:'500',feeXaf:'0'}).decision,'fees_consistent_for_manual_review');
});
test('44.5 : écarts brut ou frais => refus de rapprochement',()=>{
  for(const c of [{netXaf:'423'},{feeXaf:'77'},{expectedGrossXaf:'400'},
    {grossXaf:'501'}]){
    const r=check({...input,...c});
    assert.equal(r.decision,'disputed');assert.equal(r.paymentConfirmed,false);
  }
});
test('44.5 : chiffres non entiers, dépassement et devise interdits',()=>{
  for(const c of [{grossXaf:'-500'},{netXaf:'424.5'},{feeXaf:'1e2'},
    {netXaf:'2147483648'},{currency:'EUR'}, {grossXaf:500}])
    assert.throws(()=>check({...input,...c}),/INVALID/);
});
test('44.5 : revue de la migration interdit les anciennes confirmations sans net/frais',()=>{
  const sql=readFileSync(new URL('../../../supabase/migrations/20261029004450_pdc_v5c445_manual_gross_net_dev.sql',import.meta.url),'utf8');
  assert.match(sql,/ADD COLUMN observed_net_xaf/);
  assert.match(sql,/ADD COLUMN observed_fee_xaf/);
  assert.match(sql,/observed_net_xaf\+v_review\.observed_fee_xaf<>v_review\.observed_amount_xaf/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION pdc_private\.tara_v5c44_confirm_manual_payment_dev/);
  assert.match(sql,/REVOKE ALL ON FUNCTION pdc_private\.tara_v5c44_record_settlement_dev/);
  assert.match(sql,/UNIQUE INDEX tara_manual_final_transaction_once/);
  assert.match(sql,/SECURITY INVOKER/);
  assert.doesNotMatch(sql,/GRANT EXECUTE .* TO (?:anon|authenticated|service_role|pdc_tara_v5c_writer)/);
});
test('44.5 : aucune déclaration de paiement confirmé depuis la page client',()=>{
  const ui=readFileSync(new URL('../../../src/components/PaymentMethods/PendingManualReceiptV5C44.jsx',import.meta.url),'utf8');
  assert.match(ui,/montant brut/);
  assert.match(ui,/TaraMoney peut remettre un reçu/);
  assert.doesNotMatch(ui,/setPaymentStatus|confirmPayment|fetch\s*\(/);
});
