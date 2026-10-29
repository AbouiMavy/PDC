import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeSyntheticTaraAuditV5C44,runReadOnlyTaraAuditV5C44,
  onlyTaraReadMethodsV5C44,MOCK_PRODUCT_ID_V5C44}
  from '../src/v5c/tara-audit-lot3-v5c44.mjs';
import {mainV5C44} from '../scripts/audit-readonly-v5c44.mjs';

const run = async (scenario='missing', opts={}) => {
  const x=makeSyntheticTaraAuditV5C44(scenario);
  const report=await runReadOnlyTaraAuditV5C44({
    reader:x.reader,provider:x.provider,productId:x.productId,
    mode:'mock',...opts
  });
  return {report,counters:x.counters};
};

test('44.3 : simulation matching est explicitement fictive, sans confirmation ni admission',async()=>{
  const {report,counters}=await run('matching');
  assert.equal(report.mode,'mock');
  assert.equal(report.evidenceType,'SYNTHETIC_SIMULATION');
  assert.equal(report.decision,'corroborated');
  assert.equal(report.pdc.amountXaf,'500');
  assert.equal(report.pdc.paymentStatus,'initiated');
  assert.equal(report.paymentConfirmed,false);
  assert.equal(report.admissionGranted,false);
  assert.equal(report.settlementAuthorized,false);
  assert.equal(counters.readCalls,1);
  assert.equal(counters.providerStatusCalls,1);
  assert.ok(counters.providerListCalls>=1);
  assert.equal(report.productIdMasked.includes(MOCK_PRODUCT_ID_V5C44),false);
});

test('44.3 : états en attente et transaction absente non vérifiés',async()=>{
  for(const scenario of ['pending','missing']) {
    const {report}=await run(scenario);
    assert.equal(report.decision,'not_verified');
    assert.equal(report.paymentConfirmed,false);
  }
});

test('44.3 : écart de montant impose contrôle humain',async()=>{
  const {report}=await run('mismatch');
  assert.deepEqual([report.decision,report.reason],['manual_review','FINANCIAL_MISMATCH']);
});

test('44.3 : doublon provider déclenche contrôle humain',async()=>{
  const {report}=await run('duplicate');
  assert.deepEqual([report.decision,report.reason],['manual_review','DUPLICATE_TRANSACTION_ID']);
});

test('44.3 : pages incomplètes ne permettent pas de corroboration',async()=>{
  const {report}=await run('pagination-incomplete',{pageSize:1,maxPages:1});
  assert.deepEqual([report.decision,report.reason],['manual_review','PAGINATION_INCOMPLETE']);
});

test('44.3 : carte et général ne consultent pas le statut mobile',async()=>{
  for(const scenario of ['card','general']) {
    const {report,counters}=await run(scenario);
    assert.equal(report.decision,'manual_review');
    assert.equal(counters.providerStatusCalls,0);
    assert.equal(counters.providerListCalls,0);
  }
});

test('44.3 : fournisseur indisponible = revue humaine sans fuite',async()=>{
  const {report}=await run('provider-error');
  assert.deepEqual([report.decision,report.reason],['manual_review','PROVIDER_UNAVAILABLE']);
  assert.equal(JSON.stringify(report).includes('PRIVATE_KEY_DO_NOT_EXPOSE'),false);
});

test('44.3 : lien non émis ne déclenche aucune consultation',async()=>{
  const {report,counters}=await run('unissued');
  assert.deepEqual([report.decision,report.reason],['not_verified','LINK_NOT_ISSUED']);
  assert.equal(counters.providerStatusCalls,0);
  assert.equal(counters.providerListCalls,0);
});

test('44.3 : mode DB seule interdit tout accès à Tara',async()=>{
  const x=makeSyntheticTaraAuditV5C44('matching');
  const report=await runReadOnlyTaraAuditV5C44({
    reader:x.reader,productId:x.productId,mode:'db-only'
  });
  assert.deepEqual([report.decision,report.reason],['not_verified','PROVIDER_NOT_CONSULTED']);
  assert.equal(x.counters.providerStatusCalls,0);
  assert.equal(x.counters.providerListCalls,0);
  assert.equal(report.evidenceType,'PDC_DB_ONLY');
});

test('44.3 : seules les deux fonctions de consultation sont exposées',async()=>{
  const x=makeSyntheticTaraAuditV5C44('matching');
  const readClient=onlyTaraReadMethodsV5C44(x.provider);
  assert.deepEqual(Object.keys(readClient).sort(),['checkMobileStatus','listTransactions']);
  assert.equal(Object.hasOwn(readClient,'createPaymentLink'),false);
  assert.ok(Object.isFrozen(readClient));
});

test('44.3 : contexte produit incohérent refuse la vérification',async()=>{
  const x=makeSyntheticTaraAuditV5C44('matching');
  const fakeReader={load:async()=>({...await x.reader.load(x.productId),productId:'PDC_'+'z'.repeat(24)})};
  await assert.rejects(()=>runReadOnlyTaraAuditV5C44({
    reader:fakeReader,provider:x.provider,productId:x.productId,mode:'mock'
  }),/PDC_TARA_44_PRIVATE_CONTEXT_INVALID/);
  assert.equal(x.counters.providerStatusCalls,0);
});

test('44.3 : mauvais mode, pagination et scenario sont rejetés',async()=>{
  const x=makeSyntheticTaraAuditV5C44('matching');
  for (const opts of [{mode:'production'},{mode:'mock',pageSize:0},{mode:'mock',maxPages:21}]) {
    await assert.rejects(()=>runReadOnlyTaraAuditV5C44({
      reader:x.reader,provider:x.provider,productId:x.productId,...opts
    }),/PDC_TARA_44_AUDIT_CONFIG_INVALID/);
  }
  assert.throws(()=>makeSyntheticTaraAuditV5C44('unknown'),/PDC_TARA_44_SCENARIO_INVALID/);
});

test('44.3 : commande simulation par CLI sans configurations secrètes',async()=>{
  const report=await mainV5C44(['--mode=mock','--scenario=missing'],{});
  assert.equal(report.decision,'not_verified');
  assert.equal(report.evidenceType,'SYNTHETIC_SIMULATION');
});

test('44.3 : CLI bloque DB et fournisseur hors Codespace DEV autorisé',async()=>{
  for (const args of [
    ['--mode=db-only','--product-id='+MOCK_PRODUCT_ID_V5C44],
    ['--mode=provider-read','--allow-provider-read','--product-id='+MOCK_PRODUCT_ID_V5C44]
  ]) {
    await assert.rejects(()=>mainV5C44(args,{}),/PDC_TARA_44_DEV_ENV_REQUIRED/);
  }
});

test('44.3 : CLI rejette arguments inconnus et activation fournisseur en simulation',async()=>{
  for(const args of [['--mode=mock','--allow-provider-read'],
    ['--mode=mock','--scenario=missing','--unknown'],['--mode=mock','--mode=mock']]) {
    await assert.rejects(()=>mainV5C44(args,{}),/PDC_TARA_44_ARGUMENT_INVALID|PDC_TARA_44_DUPLICATE_ARG/);
  }
});
