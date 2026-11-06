import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=file('docs/t12/05300_t12c_mobile_direct_v5c_REVIEW_ONLY.sql');
const contract=file('backend/pdc-api/src/v5c/tara-public-order-preparation-v5c.mjs');
const browser=file('src/features/payments/public-checkout-payload-v5c29.mjs');
const coordinator=file('backend/pdc-api/src/v5c/tara-public-checkout-coordinator-v5c.mjs');
const http=file('backend/pdc-api/src/v5c/tara-public-order-http-v5c.mjs');
const page=file('src/components/PaymentMethods/PublicCheckoutV5C29.jsx');
const compose=file('backend/pdc-api/src/v5c/tara-public-sandbox-app-v5c.mjs');
const r5sql=file('docs/t12/05200_t12_r5_mobile_direct_REVIEW_ONLY.sql');
test('T12-C SQL : table séparée, UUID et idempotence',()=>{
  assert.match(sql,/CREATE TABLE pdc_private\.t12_v5c_mobile_direct_dev/);
  assert.match(sql,/order_id uuid NOT NULL UNIQUE/);
  assert.match(sql,/payment_id uuid NOT NULL UNIQUE/);
  assert.match(sql,/pdc_private\.tara_checkout_intents_v5c\(product_id\)/);
  assert.match(sql,/o\.idempotency_key<>c\.idempotency_key/);
});
test('T12-C SQL : aucune confirmation automatique et permissions privées',()=>{
  assert.match(sql,/SECURITY INVOKER SET search_path=''/);
  assert.match(sql,/JE_CONFIRME_LE_RAPPROCHEMENT_MOBILE_CAMEROUN_DEV/);
  assert.match(sql,/REVOKE ALL ON FUNCTION pdc_private\.t12_v5c_confirm_direct_evidence_dev/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION pdc_private\.t12_v5c_claim_mobile_direct_dev/);
  assert.doesNotMatch(sql,/ALTER TABLE pdc_private\.payment_attempts DISABLE ROW LEVEL SECURITY/);
});
test('T12-C SQL : exclusion de lien après claim et contrainte selected_pair conservée',()=>{
  assert.match(sql,/CREATE TRIGGER t12_v5c_direct_no_link_dev/);
  assert.match(sql,/NEW\.link_state='issued'/);
  assert.match(sql,/link_state='requested',requested_at=pg_catalog\.now\(\)/);
  assert.doesNotMatch(sql,/SET[^;]*selected_method='mobile'/);
});
test('T12-C contrat: le digest distingue direct et SMS, SMS historique inchangé',()=>{
  assert.match(contract,/digestInput=direct\?/);
  assert.match(contract,/mobileMode:'direct',mobilePhone/);
  assert.match(contract,/mobilePhone=normalizeCameroonDebitT12C/);
  assert.match(browser,/prepareMobileSelectionT12/);
  assert.match(browser,/mobileMode:data\.mobileMode,mobilePhone:data\.mobilePhone/);
});
test('T12-C orchestration : aucun fallback SMS quand direct demandé',()=>{
  assert.match(coordinator,/mobileDirectEnabled!==true\)fail\('PDC_PUBLIC_MOBILE_DIRECT_DISABLED'\)/);
  assert.match(coordinator,/await mobileDirect\.initiate/);
  assert.match(http,/request_initiated','request_rejected/);
  assert.match(page,/validateMobileDirectResponseT12/);
  assert.match(page,/VITE_PDC_V5C29_MOBILE_DIRECT_ENABLED/);
  assert.match(compose,/mobileDirectEnabled/);
});

test('T12-B source SQL: le hotfix reste reproductible',()=>{
  assert.match(r5sql,/link_state='requested', requested_at=now\(\)/);
  assert.doesNotMatch(r5sql,/selected_method='mobile', selected_messaging_channel=NULL/);
});
