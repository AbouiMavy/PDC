import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const oldSql = readFileSync(new URL('supabase/migrations/20261026001700_pdc_v5b610f3_couple_admission_dev.sql', root), 'utf8');
const fixSql = readFileSync(new URL('supabase/migrations/20261026001800_pdc_v5b610f31_fix_ambiguous_slot_dev.sql', root), 'utf8');
function body(sql) {
  const i=sql.indexOf('RETURNS TABLE(slot text,membership_id uuid,member_number text)');
  assert.ok(i>=0);
  const start=sql.indexOf('AS $fn$',i);
  const end=sql.indexOf('$fn$;',start+7);
  assert.ok(start>=0 && end>start);
  return sql.slice(start,end+5);
}
test('correction des deux usages ambigus (member et partner)', () => {
  assert.match(fixSql,/WHERE b\.order_id=p_order AND b\.slot='member'/);
  assert.match(fixSql,/WHERE b\.order_id=p_order AND b\.slot='partner'/);
  assert.equal((body(fixSql).match(/FROM pdc_private\.couple_checkout_beneficiaries_v5b610f2 b\s+WHERE b\.order_id=p_order AND b\.slot=/g)||[]).length,2);
});
test('aucune modification métier autre que les deux qualifications SQL', () => {
  const expected=body(oldSql).replaceAll('FROM pdc_private.couple_checkout_beneficiaries_v5b610f2\n                 WHERE order_id=p_order AND slot=', 'FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b\n                 WHERE b.order_id=p_order AND b.slot=');
  assert.equal(body(fixSql), expected);
});
test('migration additive sans nouvelle table ni changement de droits', () => {
  assert.match(fixSql,/^BEGIN;/m);
  assert.match(fixSql,/CREATE OR REPLACE FUNCTION pdc_private\.admit_paid_couple_dev_v5b610f3/);
  assert.doesNotMatch(fixSql,/\b(?:CREATE TABLE|ALTER TABLE|DROP TABLE|GRANT EXECUTE|CREATE ROLE)\b/i);
  assert.match(fixSql,/REVOKE ALL ON FUNCTION pdc_private\.admit_paid_couple_dev_v5b610f3/);
  assert.match(fixSql,/^COMMIT;/m);
});
