import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createCouplePortraitGrantIssuer, validateCoupleGrantRows } from '../src/couple-portrait-grants-v5b610f4.mjs';
const A='1903c0e5-3315-4cdc-9e13-2d01bfed2d49';
const B='bcb2a8fd-5148-497d-bd03-b5d7c385d91e';
const C='f4a84073-af52-493b-bdb1-48efadd3c5aa';
const D='75488c7f-53c3-4b43-b724-f3c8494a9f7d';
const NOW=1800000000000;
const rows=[{beneficiary_slot:'member',card_request_id:A,grant_id:C,expires_at:new Date(NOW+600000).toISOString()},
  {beneficiary_slot:'partner',card_request_id:B,grant_id:D,expires_at:new Date(NOW+600000).toISOString()}];
const token=(s)=>({token:s.repeat(43),tokenHash:createHash('sha256').update(s.repeat(43)).digest('hex')});
test('deux slots dans ordre canonique, meme si base les retourne inverses',()=>{
 const x=validateCoupleGrantRows([...rows].reverse(),NOW);
 assert.deepEqual(x.map(y=>y.slot),['member','partner']);
});
test('exige exactement deux lignes',()=>assert.throws(()=>validateCoupleGrantRows([rows[0]],NOW)));
test('refuse slot duplique',()=>assert.throws(()=>validateCoupleGrantRows([rows[0],rows[0]],NOW)));
test('refuse numero de demande partage',()=>assert.throws(()=>validateCoupleGrantRows([rows[0],{...rows[1],card_request_id:A}],NOW)));
test('refuse autorisation partagee',()=>assert.throws(()=>validateCoupleGrantRows([rows[0],{...rows[1],grant_id:C}],NOW)));
test('refuse identifiants invalides',()=>assert.throws(()=>validateCoupleGrantRows([{...rows[0],grant_id:'x'},rows[1]],NOW)));
test('refuse expiration passee',()=>assert.throws(()=>validateCoupleGrantRows([{...rows[0],expires_at:new Date(NOW-10).toISOString()},rows[1]],NOW)));
test('refuse expiration trop lointaine',()=>assert.throws(()=>validateCoupleGrantRows([{...rows[0],expires_at:new Date(NOW+900000).toISOString()},rows[1]],NOW)));
test('refuse dependance SQL absente',()=>assert.throws(()=>createCouplePortraitGrantIssuer({})));
test('refuse UUID invalide sans appeler SQL',async()=>{
 let count=0;const api=createCouplePortraitGrantIssuer({query:async()=>{count++;return {rows}},clock:()=>NOW});
 await assert.rejects(api.prepareTrustedPair({orderId:'x'}));assert.equal(count,0);
});
test('refuse TTL excessif avant SQL',async()=>{
 let count=0;const api=createCouplePortraitGrantIssuer({query:async()=>{count++;return {rows}},clock:()=>NOW});
 await assert.rejects(api.prepareTrustedPair({orderId:A,ttlSeconds:901}));assert.equal(count,0);
});
test('refuse les deux memes jetons',async()=>{
 let count=0;const api=createCouplePortraitGrantIssuer({query:async()=>{count++;return {rows}},clock:()=>NOW,tokenFactory:()=>token('a')});
 await assert.rejects(api.prepareTrustedPair({orderId:A}));assert.equal(count,0);
});
test('appel SQL parametre une seule fois, deux empreintes sans token brut',async()=>{
 const calls=[];let n=0;const api=createCouplePortraitGrantIssuer({query:async(q,args)=>{calls.push([q,args]);return {rows}},clock:()=>NOW,tokenFactory:()=>token(++n===1?'a':'b')});
 const res=await api.prepareTrustedPair({orderId:A});
 assert.equal(calls.length,1);assert.match(calls[0][0],/\$1::uuid,\$2::text,\$3::text,\$4::integer/);
 assert.deepEqual(calls[0][1],[A,token('a').tokenHash,token('b').tokenHash,600]);
 assert.equal(res[0].uploadToken,token('a').token);assert.equal(res[1].uploadToken,token('b').token);
 assert.notEqual(res[0].cardRequestId,res[1].cardRequestId);
 assert.ok(!JSON.stringify(calls).includes(token('a').token));
});
test('retour SQL suspect rejete',async()=>{
 const api=createCouplePortraitGrantIssuer({query:async()=>({rows:[rows[0],{...rows[1],card_request_id:A}]}),clock:()=>NOW});
 await assert.rejects(api.prepareTrustedPair({orderId:A}));
});
test('une panne SQL ne fabrique pas de fausse autorisation',async()=>{
 const api=createCouplePortraitGrantIssuer({query:async()=>{throw new Error('connection lost')},clock:()=>NOW});
 await assert.rejects(api.prepareTrustedPair({orderId:A}),/connection lost/);
});
test('pas de HTTP, pas de service key, pas de secret dans le module',()=>{
 const source=readFileSync(new URL('../src/couple-portrait-grants-v5b610f4.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/createServer|\.listen\(|SERVICE_ROLE|process\.env|fetch\(/);
});
test('SQL ne cree ni webhook ni carte et refuse roles publics',()=>{
 const source=readFileSync(new URL('../../../supabase/migrations/20261027001900_pdc_v5b610f4_couple_portrait_grants_dev.sql',import.meta.url),'utf8');
 assert.match(source,/couple_payment_verified_dev_v5b610f2/);
 assert.match(source,/couple_admissions_v5b610f3/);
 assert.match(source,/pdc_private\.applicant_photo_paid_single_v5b610e2/);
 assert.match(source,/REVOKE ALL ON FUNCTION pdc_private\.couple_photo_issue_pair_dev_v5b610f4/);
 assert.doesNotMatch(source,/CREATE TABLE|CREATE ROLE|GRANT EXECUTE TO anon/i);
});
