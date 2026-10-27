import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quoteFromPrivateDb } from '../src/v5c/contracts.mjs';
import { eurCentsToXafTens, preparePrivateTaraXafPrice, EUR_XAF_FIXED } from '../src/v5c/tara-eur-xaf-v5c.mjs';
import { makeTaraDevPgRepository } from '../src/v5c/tara-dev-pg-repository-v5c.mjs';

const U1='11111111-1111-4111-8111-111111111111';
const U2='22222222-2222-4222-8222-222222222222';
const U3='33333333-3333-4333-8333-333333333333';
const U4='44444444-4444-4444-8444-444444444444';
const sql=readFileSync(new URL('../../../supabase/migrations/20261027002100_pdc_v5c_tara_writer_gateway_dev.sql',import.meta.url),'utf8');
const quote=(amountMinor,currency='EUR',kind='couple_initial')=>quoteFromPrivateDb({
 quote_id:U1,payer_id:U2,kind,currency,amount_minor:amountMinor,
 beneficiary_ids:kind==='couple_initial'?[U3,U4]:kind==='donation'?[]:[U3],
});
const args=q=>({quote:q,paymentId:U1,idempotencyKey:'fx-test-idempotent-2026'});

for (const [euros,cents,xaf] of [
 [10,'1000','6560'],[20,'2000','13120'],[30,'3000','19680'],
 [40,'4000','26240'],[50,'5000','32800'],
]) test(`parité fixe et arrondi 10 XAF : ${euros} EUR -> ${xaf} XAF`,()=>{
 assert.equal(eurCentsToXafTens(cents),xaf);
});

test('arrondi calculé directement au multiple de 10, sans double arrondi',()=>{
 for(const cents of ['1','2','3','9','99','101','10001']){
  const value=BigInt(cents);
  const expected=((value*655957n+500000n)/1000000n)*10n;
  assert.equal(eurCentsToXafTens(cents),String(expected));
 }
});
test('conversion rejette types JS imprécis et entrées non canoniques',()=>{
 for(const x of [0,4000,4000n,0n,null,undefined,'','0','-1','00','04000','40.00','4e3',' 4000','9999999999999999999']){
  assert.throws(()=>eurCentsToXafTens(x),/PDC_TARA_FX_AMOUNT_INVALID/);
 }
});
test('débordement fournisseur rejeté même si les centimes sont BigInt',()=>{
 assert.throws(()=>eurCentsToXafTens('9999999999999999'),/PDC_TARA_FX_AMOUNT_INVALID/);
});
test('couple diaspora conserve une dette de 40 EUR et un tarif Tara de 26240 XAF',()=>{
 const q=quote('4000');const x=preparePrivateTaraXafPrice(args(q));
 assert.equal(x.originalAmountMinor,'4000');assert.equal(x.originalCurrency,'EUR');
 assert.equal(x.taraPriceXaf,'26240');assert.equal(x.kind,'couple_initial');
 assert.equal(q.beneficiaryIds.length,2);
 assert.equal(x.requiresCrossCurrencyLedgerApproval,true);
 assert.equal(x.paymentConfirmed,false);
 assert.deepEqual(x.conversion,EUR_XAF_FIXED);
 assert.equal(x.quoteId,q.quoteId);
});
test('tarif XAF issu de la DB ne subit aucune conversion',()=>{
 const x=preparePrivateTaraXafPrice(args(quote('2000','XAF','individual_initial')));
 assert.equal(x.taraPriceXaf,'2000');assert.equal(x.conversion,null);
 assert.equal(x.requiresCrossCurrencyLedgerApproval,false);
});
test('une fausse quote navigateur ne peut pas initier la conversion',()=>{
 const fake={...quote('4000')};
 assert.throws(()=>preparePrivateTaraXafPrice(args(fake)),/PDC_TRUSTED_QUOTE_REQUIRED/);
});
test('fournisseur XAF refuse les devis EUR hors montant maximal',()=>{
 assert.throws(()=>preparePrivateTaraXafPrice(args(quote('2147483648','XAF','individual_initial'))),/PDC_TARA_FX_AMOUNT_INVALID/);
});
test('conversion pure et idempotente, ne fait aucun appel réseau',()=>{
 const x=preparePrivateTaraXafPrice(args(quote('4000')));
 const y=preparePrivateTaraXafPrice(args(quote('4000')));
 assert.deepEqual(x,y);
 assert.equal(Object.isFrozen(x),true);
});
test('migration rôle dédié, login sans mot de passe et permissions minimales',()=>{
 assert.match(sql,/CREATE ROLE pdc_tara_v5c_writer[\s\S]+?PASSWORD NULL/);
 assert.match(sql,/NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
 assert.match(sql,/REVOKE ALL ON ALL TABLES IN SCHEMA pdc_private FROM pdc_tara_v5c_writer/);
 assert.match(sql,/REVOKE ALL ON ALL SEQUENCES IN SCHEMA pdc_private FROM pdc_tara_v5c_writer/);
 assert.doesNotMatch(sql,/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+(?:ALL\s+)?TABLE/i);
 assert.doesNotMatch(sql,/ALTER\s+TABLE\s+pdc_private\.payment_attempts/i);
 assert.doesNotMatch(sql,/CREATE\s+POLICY/i);
});
test('7 passerelles SECURITY DEFINER au schéma fixé',()=>{
 assert.equal((sql.match(/CREATE FUNCTION pdc_private\.tara_v5c_/g)||[]).length,7);
 assert.equal((sql.match(/SECURITY DEFINER SET search_path=''/g)||[]).length,7);
 assert.equal((sql.match(/GRANT EXECUTE ON FUNCTION pdc_private\.tara_v5c_/g)||[]).length,7);
 assert.equal((sql.match(/REVOKE ALL ON FUNCTION pdc_private\.tara_v5c_/g)||[]).length,7);
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION[^;]+TO\s+(?:PUBLIC|anon|authenticated|service_role)/i);
 assert.doesNotMatch(sql,/EXECUTE\s+pg_catalog\.format|EXECUTE\s+format\s*\(/i);
});
test('passerelle de réservation ancrée dans paiement et allocation privée',()=>{
 assert.match(sql,/FROM pdc_private\.payment_attempts[\s\S]+?FOR UPDATE/);
 assert.match(sql,/FROM pdc_private\.payment_allocations a/);
 assert.match(sql,/v_target\.n<>1/);
 assert.match(sql,/d\.id=p_quote_id AND d\.person_id=p_payer_id/);
 assert.match(sql,/ON CONFLICT \(idempotency_key\) DO NOTHING/);
 assert.match(sql,/PDC_TARA_IDEMPOTENCY_CONFLICT/);
});
test('pas de confirmation ni d’admission par les fonctions Tara',()=>{
 assert.doesNotMatch(sql,/UPDATE\s+pdc_private\.(?:payment_attempts|membership_applications|memberships|payment_events)/i);
 assert.doesNotMatch(sql,/INSERT INTO\s+pdc_private\.(?:payment_events|payment_allocations|memberships)/i);
 assert.match(sql,/untrusted\)[\s\S]+?VALUES\(/);
});
test('toutes les opérations PostgreSQL du service passent par RPC',async()=>{
 const calls=[];
 const p={query:async(sql,params)=>{
   if(sql.startsWith('SELECT current_user'))return {rows:[{role_name:'pdc_tara_v5c_writer'}]};
   calls.push({sql,params});
   if(sql.includes('tara_v5c_load_checkout'))return {rows:[]};
   return {rows:[{ok:true}]};
 }};
 const r=await makeTaraDevPgRepository({pool:p,enabled:true,environment:'sandbox'});
 assert.equal(await r.claimLinkRequest('PDC_'+'a'.repeat(24)),true);
 await r.saveIssuedLink('PDC_'+'a'.repeat(24),'https://taramoney.com/pay/mock');
 assert.equal(await r.markLinkUnknown('PDC_'+'a'.repeat(24)),true);
 assert.equal(await r.loadCheckout('PDC_'+'a'.repeat(24)),null);
 await r.recordEvidence({productId:'PDC_'+'a'.repeat(24),decision:'not_verified',
  reason:null,expectedAmountXaf:'2000',paymentChannel:'mobile'});
 assert.equal(calls.length,5);
 for(const {sql} of calls){
  assert.match(sql,/^SELECT /);
  assert.match(sql,/pdc_private\.tara_v5c_/);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
 }
});
test('aucun lien n’est disponible tant que le compte writer n’est pas provisionné',async()=>{
 await assert.rejects(makeTaraDevPgRepository({enabled:true,environment:'sandbox',pool:{query:async()=>({rows:[{role_name:'postgres'}]})}}),/PDC_TARA_PG_WRONG_ROLE/);
});
