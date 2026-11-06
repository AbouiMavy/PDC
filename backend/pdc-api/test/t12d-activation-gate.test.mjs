import test from 'node:test';
import assert from 'node:assert/strict';
import {decidePublicMobileActivationT12D,assertPublicMobileSqlReadyT12D}
  from '../src/v5c/t12c-activation-gate.mjs';
const cfg={PDC_V5C41_MOBILE_DIRECT_ENABLED:'true',
  PDC_V5C41_MOBILE_DIRECT_REVIEW_APPROVED:'true',
  PDC_V5C41_MODE:'sandbox',PDC_V5C41_SANDBOX_KEY_CONFIRMED:'true',
  PDC_V5C41_MOBILE_HMAC_SECRET:'test-only-secret-with-at-least-32-bytes'};

test('T12-D flag absent ou false => aucun debit direct',()=>{
  assert.equal(decidePublicMobileActivationT12D({}).enabled,false);
  assert.equal(decidePublicMobileActivationT12D({PDC_V5C41_MOBILE_DIRECT_ENABLED:'false'}).enabled,false);
});
test('T12-D flag mal formé => refus, jamais activation implicite',()=>{
  assert.throws(()=>decidePublicMobileActivationT12D({...cfg,PDC_V5C41_MOBILE_DIRECT_ENABLED:'TRUE'}),/FLAG_INVALID/);
});
test('T12-D refus sans revue approuvée, hors sandbox ou production',()=>{
  assert.throws(()=>decidePublicMobileActivationT12D({...cfg,PDC_V5C41_MOBILE_DIRECT_REVIEW_APPROVED:'false'}),/APPROVAL_MISSING/);
  assert.throws(()=>decidePublicMobileActivationT12D({...cfg,PDC_V5C41_MODE:'production'}),/APPROVAL_MISSING/);
  assert.throws(()=>decidePublicMobileActivationT12D({...cfg,NODE_ENV:'production'}),/APPROVAL_MISSING/);
});
test('T12-D HMAC serveur requis uniquement quand direct activé',()=>{
  assert.throws(()=>decidePublicMobileActivationT12D({...cfg,PDC_V5C41_MOBILE_HMAC_SECRET:'short'}),/HMAC_INVALID/);
  assert.equal(decidePublicMobileActivationT12D(cfg).enabled,true);
});
test('T12-D SQL: table, fonctions et trigger doivent exister',async()=>{
  let sql='';
  const yes={mobile_table:true,evidence_table:true,claim_rpc:true,finish_rpc:true,
    unknown_rpc:true,no_sms_after_direct:true};
  assert.equal(await assertPublicMobileSqlReadyT12D({query:async s=>{sql=s;return {rows:[yes]};}}),true);
  assert.match(sql,/to_regprocedure/);
  assert.match(sql,/t12_v5c_direct_no_link_dev/);
});
test('T12-D SQL absent ou erreur DB empêche activation',async()=>{
  const row={mobile_table:true,evidence_table:false,claim_rpc:true,finish_rpc:true,
    unknown_rpc:true,no_sms_after_direct:true};
  await assert.rejects(assertPublicMobileSqlReadyT12D({query:async()=>({rows:[row]})}),/SQL_NOT_READY/);
  await assert.rejects(assertPublicMobileSqlReadyT12D({query:async()=>{throw Error('private query failed');}}),/DB_PREFLIGHT_FAILED/);
  await assert.rejects(assertPublicMobileSqlReadyT12D({}),/DB_UNAVAILABLE/);
});
