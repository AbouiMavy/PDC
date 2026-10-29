import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const path=new URL('../../../supabase/migrations/20261028002700_pdc_v5c_tara_selected_channel_dev.sql',import.meta.url);
const sql=readFileSync(path,'utf8');
test('migration DEV 027: transaction atomique, canal et URL persistés',()=>{
 assert.match(sql,/^BEGIN;/m);assert.match(sql,/COMMIT;\s*$/);
 for(const f of ['selected_method','selected_messaging_channel','selected_link_field','selected_link_url'])
   assert.match(sql,new RegExp(f));
 assert.match(sql,/CREATE FUNCTION pdc_private\.tara_v5c_save_issued_channel/);
 assert.match(sql,/CREATE FUNCTION pdc_private\.tara_v5c_load_issued_channel/);
 assert.match(sql,/WHERE product_id=p_product_id AND link_state='requested'/);
});
test('reprise idempotente : pas de seconde transition depuis issued',()=>{
 assert.match(sql,/OLD\.link_state='issued'/);
 assert.match(sql,/ISSUED_CHANNEL_IMMUTABLE/);
 assert.match(sql,/p_idempotency_key/);
});
test('aucun droit public sur les RPC sélectionnées',()=>{
 for(const name of ['save_issued_channel','load_issued_channel']) {
  assert.match(sql,new RegExp(`REVOKE ALL ON FUNCTION pdc_private\\.tara_v5c_${name}`));
  assert.match(sql,new RegExp(`GRANT EXECUTE ON FUNCTION pdc_private\\.tara_v5c_${name}`));
 }
 assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role;/);
 assert.match(sql,/TO pdc_tara_v5c_writer;/);
});
test('aucune admission et confirmation de paiement dans cette migration',()=>{
 assert.doesNotMatch(sql,/UPDATE\s+pdc_private\.payment_attempts\s+SET/i);
 assert.doesNotMatch(sql,/UPDATE\s+pdc_private\.memberships\s+SET/i);
 assert.doesNotMatch(sql,/GRANT\s+ALL\s+ON\s+TABLE/i);
});
