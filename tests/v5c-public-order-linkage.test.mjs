import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261028002300_pdc_v5c_public_order_atomic_dev.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('sql/v5c-public-orders-rollback.sql',import.meta.url),'utf8');
test('la dette initiale de 2000 XAF est liée au dossier créé',()=>{
  assert.match(sql,/RETURNING id INTO v_application/);
  assert.match(sql,/INSERT INTO pdc_private\.dues_obligations\(application_id,person_id,kind,category_code/);
  assert.match(sql,/VALUES\(v_application,v_person,'initial_membership_fee',v_category,2000,'XAF','open'\)/);
});
test('pas de droit public ni admission automatique',()=>{
  assert.match(sql,/REVOKE ALL ON FUNCTION pdc_private\.tara_v5c_create_public_order/);
  assert.doesNotMatch(sql,/GRANT EXECUTE[^;]*\bTO\s+(?:anon|authenticated|service_role)\b/i);
  assert.doesNotMatch(sql,/UPDATE pdc_private\.membership_applications\s+SET\s+submission_status\s*=\s*'accepted'/i);
});
test('rollback vérifie le lien dossier-obligation',()=>{
  assert.match(rollback,/JOIN pdc_private\.membership_applications app ON app.id=d.application_id/);
  assert.match(rollback,/TEST_PDC_APPLICATION_LINK_FAILED/);
  assert.match(rollback,/ROLLBACK\s*;/);
});
