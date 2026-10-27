import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newOpaquePortraitToken,hashPortraitToken,createApplicantGrantRepository } from '../backend/pdc-api/src/applicant-grant-ledger-v5b610e2.mjs';
const A='1903c0e5-3315-4cdc-9e13-2d01bfed2d49';
const B='bcb2a8fd-5148-497d-bd03-b5d7c385d91e';
test('jeton opaque aleatoire, 32 octets cryptographiques',()=>{
 const x=newOpaquePortraitToken(); assert.match(x.token,/^[A-Za-z0-9_-]{43}$/);assert.match(x.tokenHash,/^[0-9a-f]{64}$/);
 assert.notEqual(x.tokenHash,x.token);
});
test('deux capacites ne sont jamais identiques',()=>assert.notEqual(newOpaquePortraitToken().token,newOpaquePortraitToken().token));
test('empreinte stable pour verifier sans stocker la valeur brute',()=>{
 const x=newOpaquePortraitToken();assert.equal(x.tokenHash,hashPortraitToken(x.token));
});
test('jetons courts ou caracteres interdits bloques',()=>{
 for(const x of ['abc','A'.repeat(31),'A'.repeat(257),'A'.repeat(40)+'+',' '])
  assert.throws(()=>hashPortraitToken(x),/PDC_PORTRAIT_TOKEN_INVALID/);
});
test('aucune dependance DB manquante acceptee',()=>assert.throws(()=>createApplicantGrantRepository({}),/PDC_APPLICANT_GRANT_DB_MISSING/));
test('emission valide construit des requetes parametrees',async()=>{
 const calls=[];const repo=createApplicantGrantRepository({query:async(q,args)=>{calls.push([q,args]);return {rows:[{id:A}]};}});
 const result=await repo.issueVerified({cardRequestId:A,paymentId:B,tokenHash:'a'.repeat(64)});
 assert.equal(result.authorizationId,A);assert.match(calls[0][0],/\$1::uuid.*\$2::uuid.*\$3::text.*\$4::integer/);assert.deepEqual(calls[0][1],[A,B,'a'.repeat(64),600]);
});
test('refus de tentative issuance avec montants/ttl invalides',async()=>{
 let n=0;const repo=createApplicantGrantRepository({query:async()=>{n++;return {rows:[]};}});
 for(const arg of [{cardRequestId:'abc',paymentId:B,tokenHash:'a'.repeat(64)},{cardRequestId:A,paymentId:B,tokenHash:'a'.repeat(63)},
                   {cardRequestId:A,paymentId:B,tokenHash:'a'.repeat(64),ttlSeconds:901}])
    await assert.rejects(repo.issueVerified(arg),/PDC_PORTRAIT_ISSUE_INVALID/);
 assert.equal(n,0);
});
test('une consommation validée retourne uniquement une autorisation opaque',async()=>{
 const repo=createApplicantGrantRepository({query:async()=>({rows:[{authorization_id:B,card_request_id:A,permission:'portrait:write-once'}]})});
 assert.deepEqual(await repo.consumeVerifiedGrant({cardRequestId:A,tokenHash:'b'.repeat(64)}),{authorizationId:B,cardRequestId:A,permission:'portrait:write-once'});
});
test('refus quand la base renvoie une demande différente',async()=>{
 const repo=createApplicantGrantRepository({query:async()=>({rows:[{authorization_id:B,card_request_id:B,permission:'portrait:write-once'}]})});
 await assert.rejects(repo.consumeVerifiedGrant({cardRequestId:A,tokenHash:'b'.repeat(64)}),/PDC_APPLICANT_UPLOAD_DENIED/);
});
test('refus du token absent sans consulter SQL',async()=>{
 let n=0;const repo=createApplicantGrantRepository({query:async()=>{n++;return {rows:[]};}});
 await assert.rejects(repo.consumeVerifiedGrant({cardRequestId:A,tokenHash:'BAD'}),/PDC_PORTRAIT_REDEEM_INVALID/);assert.equal(n,0);
});
test('une permission inattendue est refusée',async()=>{
 const repo=createApplicantGrantRepository({query:async()=>({rows:[{authorization_id:B,card_request_id:A,permission:'all:write'}]})});
 await assert.rejects(repo.consumeVerifiedGrant({cardRequestId:A,tokenHash:'c'.repeat(64)}),/PDC_APPLICANT_UPLOAD_DENIED/);
});
test('aucun endpoint HTTP, mot de passe ou cle admin dans le composant',()=>{
 const x=readFileSync(new URL('../backend/pdc-api/src/applicant-grant-ledger-v5b610e2.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(x,/createServer\s*\(|\bSUPABASE_SERVICE_ROLE_KEY\b|\.listen\s*\(|process\.env/);
});
test('migration protege acces public et interdit provisoirement le couple',()=>{
 const x=readFileSync(new URL('../supabase/migrations/20261026001400_pdc_v5b610e2_applicant_grants_dev.sql',import.meta.url),'utf8');
 assert.match(x,/a\.category_code <> 'couple'/);
 assert.match(x,/FOR UPDATE/);
 assert.match(x,/REVOKE ALL ON FUNCTION pdc_private\.applicant_photo_issue_dev_v5b610e2/);
 assert.match(x,/pdc_portrait_upload_runtime_v5b610c/);
});
