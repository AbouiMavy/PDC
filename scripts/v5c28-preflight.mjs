#!/usr/bin/env node
// V5-C.28 — Contrôle hors réseau des prérequis; ne lit aucun secret.
// Lancez depuis /workspaces/PDC-v5c : node scripts/v5c28-preflight.mjs
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

export const CHECKS = Object.freeze([
  {
    id:'020-intents', file:'supabase/migrations/20261027002000_pdc_v5c_tara_preconciliation_dev.sql',
    need:[/CREATE TABLE pdc_private\.tara_checkout_intents_v5c\s*\(/, /CREATE TABLE pdc_private\.tara_reconciliation_evidence_v5c\s*\(/, /ENABLE ROW LEVEL SECURITY/]
  },
  {
    id:'021-writer', file:'supabase/migrations/20261027002100_pdc_v5c_tara_writer_gateway_dev.sql',
    need:[/CREATE ROLE pdc_tara_v5c_writer\b/,/PASSWORD NULL/,/CREATE FUNCTION pdc_private\.tara_v5c_reserve_intent\s*\(/,/CREATE FUNCTION pdc_private\.tara_v5c_claim_link\s*\(/,/CREATE FUNCTION pdc_private\.tara_v5c_mark_unknown\s*\(/,/REVOKE ALL ON ALL TABLES IN SCHEMA pdc_private FROM pdc_tara_v5c_writer/]
  },
  {
    id:'023-public-order', file:'supabase/migrations/20261028002300_pdc_v5c_public_order_atomic_dev.sql',
    need:[/CREATE TABLE pdc_private\.public_checkout_orders_v5c\s*\(/,/CREATE FUNCTION pdc_private\.tara_v5c_create_public_order\s*\(/,/application_id,person_id,kind,category_code,amount_due_minor,currency,status/,/WHEN 'virement' THEN 'bank_transfer' ELSE 'tara'/,/REVOKE ALL ON FUNCTION pdc_private\.tara_v5c_create_public_order\(jsonb\)/]
  },
  {
    id:'027-selected-channel', file:'supabase/migrations/20261028002700_pdc_v5c_tara_selected_channel_dev.sql',
    need:[/ADD COLUMN selected_method text/,/ADD COLUMN selected_link_field text/,/CREATE FUNCTION pdc_private\.tara_v5c_save_issued_channel\s*\(/,/CREATE FUNCTION pdc_private\.tara_v5c_load_issued_channel\s*\(/,/'smsLink'/,/'cardLink'/,/REVOKE ALL ON FUNCTION pdc_private\.tara_v5c_save_issued_channel/]
  },
  {
    id:'public-http', file:'backend/pdc-api/src/v5c/tara-public-order-http-v5c.mjs',
    need:[/verifyHuman/,/enforceRateLimit/,/sandbox/]
  },
  {
    id:'private-order-repository', file:'backend/pdc-api/src/v5c/tara-public-order-pg-v5c.mjs',
    need:[/pdc_tara_v5c_writer/,/tara_v5c_create_public_order\(\$1::jsonb\)/]
  },
  {
    id:'private-channel-repository', file:'backend/pdc-api/src/v5c/tara-selected-channel-pg-v5c.mjs',
    need:[/pdc_tara_v5c_writer/,/tara_v5c_save_issued_channel\(/,/tara_v5c_load_issued_channel\(/]
  },
  {
    id:'no-live-listen', file:'backend/pdc-api/src/v5c/tara-public-sandbox-app-v5c.mjs',
    need:[/issueLinks=false/,/enabled=false/,/environment='disabled'/],
    forbid:[/\b\.listen\s*\(/]
  },
]);

export function runPreflight(root) {
  const output=[];
  for (const c of CHECKS) {
    const file=resolve(root,c.file);
    if (!existsSync(file)) {output.push({id:c.id,ok:false,detail:'FICHIER ABSENT',file:c.file});continue;}
    const contents=readFileSync(file,'utf8');
    const missing=c.need.filter(re=>!re.test(contents)).map(re=>String(re));
    const forbidden=(c.forbid||[]).filter(re=>re.test(contents)).map(re=>String(re));
    output.push({id:c.id,ok:missing.length===0&&forbidden.length===0,
      detail:missing.length||forbidden.length?`Contrats absents: ${missing.join(' ; ')} ; interdits: ${forbidden.join(' ; ')}`:'Structure attendue présente',file:c.file});
  }
  // La présence d'un fichier n'implique pas son application Supabase.
  return {checks:output,success:output.every(c=>c.ok),databaseInspected:false,paymentsInitiated:false};
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const root=resolve(process.argv[2]||'.');
  const result=runPreflight(root);
  for(const x of result.checks) console.log(`${x.ok?'PASS':'FAIL'} ${x.id} — ${x.detail}`);
  console.log('HORS RÉSEAU. Supabase NON interrogé; aucune migration ni paiement exécuté.');
  if(!result.success) process.exitCode=1;
}
