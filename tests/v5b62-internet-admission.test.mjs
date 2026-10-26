import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261025000700_pdc_v5b62_internet_admission_dev.sql',import.meta.url),'utf8');
const integration=readFileSync(new URL('./sql/v5b62-internet-admission-test.sql',import.meta.url),'utf8');

test('V5-B.6.2 : migration transactionnelle et additive',()=>{
  assert.match(sql,/^BEGIN;/m);
  assert.match(sql,/^COMMIT;/m);
  assert.match(sql,/CREATE TABLE pdc_private\.internet_member_counter_v5b62/);
  assert.match(sql,/UPDATE pdc_private\.internet_member_counter_v5b62/);
  assert.doesNotMatch(sql,/\bnextval\s*\(/i);
  assert.doesNotMatch(sql,/\bDROP\s+TABLE\b/i);
});

test('Numero M/F derive uniquement de la civilite dans PostgreSQL',()=>{
  assert.match(sql,/WHEN 'Monsieur' THEN 'M'/);
  assert.match(sql,/WHEN 'Madame' THEN 'F'/);
  assert.match(sql,/pdc_private\.format_internet_member_number\(v_prefix,v_serial\)/);
  assert.match(sql,/PDC_CIVILITY_REQUIRED/);
});

test('Controle de paiement verifie et lien avec la demande',()=>{
  assert.match(sql,/d\.application_id=v_application\.id/);
  assert.match(sql,/p\.status='confirmed'/);
  assert.match(sql,/e\.verified_at IS NOT NULL/);
  assert.match(sql,/p\.provider IN \('tara','stripe'\)/);
  assert.match(sql,/PDC_PAYMENT_NOT_VERIFIED/);
  assert.match(sql,/PDC_COUPLE_PAYMENT_MODEL_PENDING/);
});

test('Idempotence, refus doublon et audit',()=>{
  assert.match(sql,/PDC_MEMBER_ALREADY_EXISTS/);
  assert.match(sql,/PDC_ADMISSION_ALREADY_CLOSED/);
  assert.match(sql,/RETURN QUERY SELECT v_member,v_number/);
  assert.match(sql,/internet_number_reservations/);
  assert.match(sql,/set_config\('pdc.actor_user_id','',true\)/);
});

test('Aucune permission accordee a React ou a l API de lecture seule',()=>{
  assert.match(sql,/REVOKE ALL ON FUNCTION pdc_private\.admit_paid_internet_dev\(uuid\)/);
  assert.match(sql,/pdc_api_runtime_v5b3/);
  assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION pdc_private\.admit_paid_internet_dev/);
});

test('Script integration test rollback et garde le compteur',()=>{
  assert.match(integration,/^BEGIN;/m);
  assert.match(integration,/^ROLLBACK;/m);
  assert.match(integration,/v_initial_serial\+1/);
  assert.match(integration,/PDC_PAYMENT_NOT_VERIFIED/);
});
