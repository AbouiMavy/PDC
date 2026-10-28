import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeTaraAuthorizedCheckoutLoader } from '../src/v5c/tara-authorized-checkout-loader-v5c.mjs';

const userId='11111111-1111-4111-8111-111111111111';
const paymentId='22222222-2222-4222-8222-222222222222';
const personId='33333333-3333-4333-8333-333333333333';
const quoteId='44444444-4444-4444-8444-444444444444';
const row={payment_id:paymentId,quote_id:quoteId,payer_id:personId,kind:'renewal',
  amount_minor:'5000',currency:'XAF',beneficiary_ids:[personId]};
const setup = ({role='pdc_tara_v5c_writer',rows=[row],throwQuery=false}={}) => {
  const calls=[];
  const pool={query:async (sql,params)=>{
    calls.push({sql,params});
    if (sql.startsWith('SELECT current_user')) return {rows:[{role_name:role}]};
    if(throwQuery)throw new Error('private-db-password-must-not-leak');
    return {rows};
  }};
  return {pool,calls};
};

test('désactivé par défaut, refus production',async()=>{
  await assert.rejects(()=>makeTaraAuthorizedCheckoutLoader({}),/QUOTE_LOADER_DISABLED/);
  await assert.rejects(()=>makeTaraAuthorizedCheckoutLoader({pool:setup().pool,enabled:true,environment:'production'}),/QUOTE_LOADER_DISABLED/);
});
test('refuse tout rôle SQL autre que le writer dédié',async()=>{
  for(const role of ['postgres','service_role','pdc_api_runtime_v5b3']){
    await assert.rejects(()=>makeTaraAuthorizedCheckoutLoader({pool:setup({role}).pool,
      enabled:true,environment:'sandbox'}),/QUOTE_LOADER_WRONG_ROLE/);
  }
});
test('charge uniquement un devis privé autorisé, paramètres SQL bornés',async()=>{
  const fixture=setup();
  const load=await makeTaraAuthorizedCheckoutLoader({pool:fixture.pool,enabled:true,environment:'sandbox'});
  const x=await load({userId,paymentId});
  assert.equal(x.paymentId,paymentId);
  assert.equal(x.quote.quoteId,quoteId);
  assert.equal(x.quote.payerId,personId);
  assert.equal(x.quote.amountMinor,'5000');
  assert.equal(x.quote.currency,'XAF');
  assert.equal(x.quote.kind,'renewal');
  assert.deepEqual(x.quote.beneficiaryIds,[personId]);
  assert.equal(fixture.calls.length,2);
  assert.match(fixture.calls[1].sql,/tara_v5c_authorized_checkout\(\$1::uuid,\$2::uuid\)/);
  assert.deepEqual(fixture.calls[1].params,[userId,paymentId]);
});
test('utilisateur non autorisé => aucune ligne, aucun devis',async()=>{
  const f=setup({rows:[]});
  const load=await makeTaraAuthorizedCheckoutLoader({pool:f.pool,enabled:true,environment:'sandbox'});
  assert.equal(await load({userId,paymentId}),null);
});
test('refuse identifiants invalides et réponses corrompues',async()=>{
  const f=setup({rows:[{...row,payment_id:userId}]});
  const load=await makeTaraAuthorizedCheckoutLoader({pool:f.pool,enabled:true,environment:'sandbox'});
  await assert.rejects(()=>load({userId:'xxx',paymentId}),/QUOTE_LOOKUP_INVALID/);
  await assert.rejects(()=>load({userId,paymentId}),/QUOTE_RESPONSE_INVALID/);
  const g=setup({rows:[row,row]});
  const many=await makeTaraAuthorizedCheckoutLoader({pool:g.pool,enabled:true,environment:'sandbox'});
  await assert.rejects(()=>many({userId,paymentId}),/QUOTE_RESPONSE_INVALID/);
});
test('une erreur PostgreSQL ne divulgue aucun secret',async()=>{
  const f=setup({throwQuery:true});
  const load=await makeTaraAuthorizedCheckoutLoader({pool:f.pool,enabled:true,environment:'sandbox'});
  await assert.rejects(()=>load({userId,paymentId}),e=>e.code==='PDC_TARA_QUOTE_LOOKUP_UNAVAILABLE' && !e.message.includes('password'));
});
test('migration : lecture seule, pas de privilèges SQL publics',()=>{
  const src=readFileSync(new URL('../../../supabase/migrations/20261028002200_pdc_v5c_tara_authorized_checkout_dev.sql',import.meta.url),'utf8');
  assert.match(src,/SECURITY DEFINER SET search_path = ''/);
  assert.match(src,/member_auth_links/);
  assert.match(src,/l\.auth_user_id = p_auth_user_id/);
  assert.match(src,/REVOKE ALL ON FUNCTION/);
  assert.match(src,/GRANT EXECUTE ON FUNCTION/);
  assert.doesNotMatch(src,/\b(?:INSERT INTO|DELETE FROM|UPDATE pdc_private|ALTER TABLE|GRANT SELECT|GRANT INSERT)\b/i);
});
