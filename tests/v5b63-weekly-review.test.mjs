import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261025000800_pdc_v5b63_weekly_review_dev.sql', import.meta.url),'utf8');
const integration = readFileSync(new URL('./sql/v5b63-weekly-review-test.sql', import.meta.url),'utf8');

test('additive migration, private schema and explicit RLS',()=>{
  for(const n of ['membership_review_batches','membership_review_entries']) {
    assert.match(sql,new RegExp(`CREATE TABLE pdc_private\\.${n}`));
    assert.match(sql,new RegExp(`ALTER TABLE pdc_private\\.${n} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql,new RegExp(`REVOKE ALL ON pdc_private\\.${n}`));
  }
});
test('unique open batch and immutable snapshot membership id',()=>{
  assert.match(sql,/membership_review_only_one_open_v5b63/);
  assert.match(sql,/membership_id uuid NOT NULL UNIQUE/);
  assert.match(sql,/m\.verified_at IS NULL/);
});
test('admin permissions checked for all four functions',()=>{
  for(const name of ['open_weekly_review_dev','list_weekly_review_dev','revoke_internet_membership_dev','close_weekly_review_dev']) {
    const start=sql.indexOf('CREATE FUNCTION pdc_private.'+name);
    assert.ok(start>=0,name);
    const block=sql.substring(start,sql.indexOf('$fn$;',start)+5);
    assert.match(block,/SECURITY INVOKER/);
    assert.match(block,/api_is_national_admin\(p_actor\)/);
    assert.match(sql,new RegExp(`REVOKE ALL ON FUNCTION pdc_private\\.${name}\\(`));
  }
});
test('no writes via active service or API roles',()=>{
  assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION/);
  for(const name of ['open_weekly_review_dev','revoke_internet_membership_dev']) {
    assert.match(sql,new RegExp(`REVOKE ALL ON FUNCTION pdc_private\\.${name}\\([\\s\\S]*?service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;`));
  }
});
test('revocation invalidates cards and preserves historical numbers',()=>{
  assert.match(sql,/UPDATE pdc_private\.memberships SET status='ended'/);
  assert.match(sql,/UPDATE pdc_private\.membership_card_requests[\s\S]*?status='invalidated'/);
  assert.match(sql,/membership\.revoked/);
  assert.doesNotMatch(sql,/DELETE FROM pdc_private\.(memberships|internet_number_reservations|payment_attempts)/);
});
test('closing review never issues or delivers cards',()=>{
  assert.match(sql,/SET verified_at=pg_catalog\.now\(\)/);
  assert.match(sql,/SET status='reviewed'/);
  assert.doesNotMatch(sql,/SET status='issued'/);
  assert.doesNotMatch(sql,/SET status='delivered'/);
});
test('SQL Editor integration self rolls back and asserts 10 checkpoints',()=>{
  assert.match(integration,/^BEGIN;/m);
  assert.match(integration,/^ROLLBACK;/m);
  for(let i=1;i<=10;i++) assert.match(integration,new RegExp(`RAISE NOTICE '${i}\/10`));
  assert.match(integration,/pdc-v5b3-test@example\.invalid/);
});
