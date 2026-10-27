import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20261025000200_pdc_v5b2_admission_dev.sql','utf8');
const integration = readFileSync('tests/sql/v5b2-admission-test.sql','utf8');

test('nouvelle migration distincte du schéma V5-B.1', () => {
  assert.match(sql, /CREATE SEQUENCE pdc_private\.member_number_dev_seq/);
  assert.match(sql, /CREATE FUNCTION pdc_private\.admit_member_dev/);
  assert.match(sql, /SECURITY INVOKER/g);
});
test('admission réservée aux administrateurs nationaux', () => {
  assert.match(sql, /role_code = 'national_admin'/);
  assert.match(sql, /ra\.valid_until IS NULL OR ra\.valid_until >/);
  assert.match(sql, /PDC_NOT_AUTHORIZED/);
});
test('accès navigateur interdit', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION pdc_private\.admit_member_dev\(uuid,uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION pdc_private\.admit_member_dev\(uuid,uuid\) TO service_role/);
});
test('admission nécessite une validation préalable du paiement', () => {
  assert.match(sql, /pdc_private\.obligation_balances/);
  assert.match(sql, /'initial_membership_fee'/);
  assert.match(sql, /d\.amount_due_minor = 2000 AND b\.balance_minor = 0/);
  assert.match(sql, /PDC_INITIAL_FEE_NOT_CONFIRMED/);
});
test('identifiant attribué uniquement côté PostgreSQL', () => {
  assert.match(sql, /pg_catalog\.nextval/);
  assert.match(sql, /PDC-DEV-/);
  assert.match(sql, /PDC_MEMBER_ALREADY_EXISTS/);
});
test('journal automatique des admissions et décisions', () => {
  assert.match(sql, /CREATE TRIGGER audit_memberships_v5b2/);
  assert.match(sql, /CREATE TRIGGER audit_application_status_v5b2/);
  assert.match(sql, /INSERT INTO pdc_private\.audit_log/);
});
test('scripts de test transactionnels et annulés', () => {
  assert.match(integration,/^BEGIN;/m);
  assert.match(integration,/ROLLBACK;\s*$/);
  assert.match(integration,/OK 8\/8/);
});
