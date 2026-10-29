import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessTaraWebhookAuthenticityV5C44,
  TARA_PROVIDER_SIGNATURE_CONTRACT_V5C44} from '../src/v5c/tara-provider-auth-v5c44.mjs';
import {makeTaraV5C44AuditReaderPg,makeTaraV5C44ReadOnlyAuditor}
  from '../src/v5c/tara-readonly-audit-v5c44.mjs';

const id='PDC_'+'a'.repeat(24);
const base=Object.freeze({productId:id,paymentId:'11111111-1111-4111-8111-111111111111',
  amountXaf:'2000',currency:'XAF',linkState:'issued',paymentStatus:'initiated',
  selectedMethod:'mobile',selectedLinkField:'smsLink'});
const paid={transactionId:id,amount:'2000',currency:'XAF',status:'PAID'};
const provider=(overrides={})=>{
  const calls=[];
  const client={
    async checkMobileStatus(productId){calls.push('status');return {productId,status:'SUCCESS'};},
    async listTransactions({start,size}){calls.push(['list',start,size]);return start===0?[paid]:[];},
    ...overrides,
  };
  return {client,calls};
};
const setup=(row=base, overrides={})=>{
  const {client,calls}=provider(overrides);
  const reader={load:async()=>row};
  return {audit:makeTaraV5C44ReadOnlyAuditor({reader,client,
    enabled:true,environment:'sandbox'}),calls};
};

test('44.1 : contrat de signature non confirmé, verrou fermé',()=>{
  assert.equal(TARA_PROVIDER_SIGNATURE_CONTRACT_V5C44.confirmedByProvider,false);
  for(const data of [undefined,{}, {signature:'fake',trusted:true},
     {token:'private-but-not-provider-signature',headers:{'x-signature':'fake'}}]) {
    const value=assessTaraWebhookAuthenticityV5C44(data);
    assert.equal(value.authenticated,false);
    assert.equal(value.financialEvidence,false);
    assert.equal(value.eligibleForSettlement,false);
    assert.equal(Object.isFrozen(value),true);
  }
});
test('44.2 : lecture SQL refuse une activation implicite',async()=>{
  await assert.rejects(makeTaraV5C44AuditReaderPg({pool:{query:async()=>({})}}),
    /PDC_TARA_44_AUDIT_READER_DISABLED/);
  await assert.rejects(makeTaraV5C44AuditReaderPg({
    pool:{query:async()=>({rows:[{role_name:'postgres'}]})},
    enabled:true,environment:'sandbox'}),/PDC_TARA_44_WRONG_ROLE/);
});
test('44.2 : lecture SQL par RPC, rôle privé, sans DML',async()=>{
  const calls=[];
  const pool={query:async(sql,params)=>{
    calls.push({sql,params});
    return sql.startsWith('SELECT current_user')
      ? {rows:[{role_name:'pdc_tara_v5c_writer'}]}
      : {rows:[base]};
  }};
  const reader=await makeTaraV5C44AuditReaderPg({pool,enabled:true,environment:'sandbox'});
  assert.deepEqual(await reader.load(id),base);
  assert.deepEqual(calls[1].params,[id]);
  assert.match(calls[1].sql,/^SELECT \* FROM pdc_private\.tara_v5c44_load_audit_context/);
  assert.doesNotMatch(calls[1].sql,/\b(?:UPDATE|DELETE|INSERT|ALTER|DROP)\b/i);
});
test('44.2 : SQL n’expose ni tableau public ni écriture financière',()=>{
  const sql=readFileSync(new URL('../../../supabase/migrations/20261029004400_pdc_v5c44_audit_context_dev.sql',import.meta.url),'utf8');
  assert.match(sql,/SECURITY DEFINER SET search_path = ''/);
  assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]+?PUBLIC,anon,authenticated,service_role/);
  assert.match(sql,/GRANT EXECUTE[\s\S]+?TO pdc_tara_v5c_writer/);
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|INSERT INTO|TRUNCATE)\s+pdc_private\./i);
});
test('44.2 : produit inconnu/ligne étrangère refusés sans appel provider',async()=>{
  const {audit,calls}=setup({...base,productId:'OTHER'});
  await assert.rejects(()=>audit.inspect(id),/PDC_TARA_44_PRIVATE_CONTEXT_INVALID/);
  assert.equal(calls.length,0);
});
test('44.2 : paiement non éligible ou lien non émis ne contactent pas Tara',async()=>{
  const one=setup({...base,linkState:'reserved'});
  assert.equal((await one.audit.inspect(id)).decision,'not_verified');
  assert.equal(one.calls.length,0);
  const two=setup({...base,paymentStatus:'confirmed'});
  assert.equal((await two.audit.inspect(id)).reason,'PAYMENT_STATUS_NOT_ELIGIBLE');
  assert.equal(two.calls.length,0);
});
test('44.2 : carte et canaux généraux restent en revue humaine, zéro requête',async()=>{
  const card=setup({...base,selectedMethod:'carte',selectedLinkField:'cardLink'});
  const r=await card.audit.inspect(id);
  assert.deepEqual([r.decision,r.reason,r.paymentConfirmed,r.admissionGranted],
    ['manual_review','CARD_STATUS_CONTRACT_MISSING',false,false]);
  assert.equal(card.calls.length,0);
  const generic=setup({...base,selectedMethod:'tara',selectedLinkField:'generalLink'});
  assert.equal((await generic.audit.inspect(id)).reason,'CHANNEL_NOT_VERIFIED');
  assert.equal(generic.calls.length,0);
});
test('44.2 : canal déclaré en base incohérent ne contactent pas Tara',async()=>{
  const x=setup({...base,selectedMethod:'mobile',selectedLinkField:'cardLink'});
  assert.equal((await x.audit.inspect(id)).reason,'CHANNEL_NOT_VERIFIED');
  assert.equal(x.calls.length,0);
});
test('44.2 : double corroboration mobile reste non comptabilisée',async()=>{
  const {audit,calls}=setup();
  const r=await audit.inspect(id,{pageSize:2,maxPages:3});
  assert.equal(r.decision,'corroborated');
  assert.equal(r.amountXaf,'2000');
  assert.equal(r.requiresAtomicDbReconciliation,true);
  assert.equal(r.paymentConfirmed,false);
  assert.equal(r.admissionGranted,false);
  assert.equal(r.settlementAuthorized,false);
  assert.ok(calls.length>0);
});
test('44.2 : montant différent => intervention humaine',async()=>{
  const x=setup(base,{listTransactions:async()=>[{...paid,amount:'1999'}]});
  assert.equal((await x.audit.inspect(id)).reason,'FINANCIAL_MISMATCH');
});
test('44.2 : doublons provider et pagination incomplète refusent une décision positive',async()=>{
  const a=setup(base,{listTransactions:async()=>[paid,paid]});
  assert.equal((await a.audit.inspect(id)).reason,'DUPLICATE_TRANSACTION_ID');
  const b=setup(base,{listTransactions:async()=>[paid]});
  assert.equal((await b.audit.inspect(id,{pageSize:1,maxPages:1})).reason,'PAGINATION_INCOMPLETE');
});
test('44.2 : provider indisponible => revue humaine, pas de fuite',async()=>{
  const x=setup(base,{checkMobileStatus:async()=>{throw Error('private-api-key');}});
  const r=await x.audit.inspect(id);
  assert.equal(r.decision,'manual_review');
  assert.equal(r.reason,'PROVIDER_UNAVAILABLE');
  assert.equal(JSON.stringify(r).includes('private-api-key'),false);
});
test('44.2 : protections de démarrage et pagination',async()=>{
  assert.throws(()=>makeTaraV5C44ReadOnlyAuditor({}),/PDC_TARA_44_AUDITOR_DISABLED/);
  const x=setup();
  for (const args of [{pageSize:0},{maxPages:0},{pageSize:101}])
    await assert.rejects(()=>x.audit.inspect(id,args),/PDC_TARA_44_PAGINATION_INVALID/);
});
