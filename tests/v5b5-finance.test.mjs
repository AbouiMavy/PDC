import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatMinor, validateFinanceResponse } from '../src/features/admin-dev/finance.mjs';
import { createAdminDevClient } from '../src/features/admin-dev/client.mjs';

const sample={currencies:[
 {currency:'EUR',initialFeeDueMinor:'0',initialFeePaidMinor:'0',annualDuesDueMinor:'0',annualDuesPaidMinor:'0',donationsConfirmedMinor:'1500'},
 {currency:'XAF',initialFeeDueMinor:'2000',initialFeePaidMinor:'2000',annualDuesDueMinor:'12000',annualDuesPaidMinor:'3000',donationsConfirmedMinor:'500'},
]};
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

test('money is displayed from minor units without currency conversion or floating rounding',()=>{
 assert.match(formatMinor('1500','EUR','fr'),/^15,00 €/);
 assert.match(formatMinor('1501','EUR','en'),/^15\.01 €/);
 assert.match(formatMinor('2000','XAF','fr'),/FCFA$/);
 assert.match(formatMinor('9007199254740994','XAF','en'),/FCFA$/);
 assert.throws(()=>formatMinor('-1','XAF'));
 assert.throws(()=>formatMinor('500.12','EUR'));
});

test('response rejects malformed sums and missing currencies',()=>{
 assert.deepEqual(validateFinanceResponse(sample),sample);
 assert.throws(()=>validateFinanceResponse({currencies:[sample.currencies[0]]}),/FINANCE_BAD_RESPONSE/);
 assert.throws(()=>validateFinanceResponse({currencies:[sample.currencies[0],{...sample.currencies[1],annualDuesPaidMinor:1}]}),/FINANCE_BAD_RESPONSE/);
});

test('admin client requires signed-in token before financial API request',async()=>{
 let called=0;
 const client=createAdminDevClient({authOrigin:'https://fake.supabase.co',publishableKey:'sb_publishable_test',fetchImpl:async(uri)=>{
  called++;
  if(String(uri).includes('/auth/v1/token')) return json(200,{access_token:'abc.def.ghi'});
  if(String(uri).endsWith('finance-overview')) return json(200,sample);
  throw Error('unexpected');
 }});
 await assert.rejects(client.request('/v1/admin/finance-overview'),err=>err.status===401);
 assert.equal(called,0);
 await client.signIn('test@example.invalid','fake');
 assert.deepEqual(await client.request('/v1/admin/finance-overview'),sample);
 assert.equal(called,2);
 client.clear();
 await assert.rejects(client.request('/v1/admin/finance-overview'),err=>err.status===401);
});

test('frontend rejects forged financial payload',async()=>{
 const client=createAdminDevClient({authOrigin:'https://fake.supabase.co',publishableKey:'sb_publishable_test',fetchImpl:async(uri)=>{
  if(String(uri).includes('/auth/v1/token'))return json(200,{access_token:'abc.def.ghi'});
  return json(200,{currencies:[sample.currencies[0],{...sample.currencies[1],annualDuesPaidMinor:'NaN'}]});
 }});
 await client.signIn('test@example.invalid','fake');
 await assert.rejects(client.request('/v1/admin/finance-overview'),err=>err.status===503);
});

test('migration uses restricted definer function and confirms only paid allocations',()=>{
 const sql=readFileSync('supabase/migrations/20261025000500_pdc_v5b5_finance_overview.sql','utf8');
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/SET search_path = ''/);
 assert.match(sql,/api_is_national_admin\(p_actor_user_id\)/);
 assert.match(sql,/WHERE p.status = 'confirmed'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION pdc_private.api_finance_overview\(uuid\)/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION pdc_private.api_finance_overview\(uuid\) TO pdc_api_v5b3/);
 const old=readFileSync('src/features/admin-dev/AdminDev.jsx','utf8');
 assert.match(old,/pdc-admin-heritage/);
 assert.doesNotMatch(old,/localStorage|sessionStorage/);
});
