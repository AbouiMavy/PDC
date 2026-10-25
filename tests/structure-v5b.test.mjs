import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../supabase/migrations/20261025000100_pdc_v5b_private_schema.sql',import.meta.url),'utf8');
test('schema distinct de public et accès anonymes retirés',()=>{
  assert.match(sql,/CREATE SCHEMA IF NOT EXISTS pdc_private/);
  assert.match(sql,/REVOKE ALL ON SCHEMA pdc_private FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
});
test('contrôles d’unicité et idempotence prévus',()=>{
  assert.match(sql,/UNIQUE\(provider, provider_event_id\)/);
  assert.match(sql,/one_initial_fee_per_person/);
  assert.match(sql,/one_dues_per_year/);
});
test('future administration territoriale et audit prévus',()=>{
  assert.match(sql,/CREATE TABLE pdc_private.role_assignments/);
  assert.match(sql,/CREATE TABLE pdc_private.audit_log/);
});
