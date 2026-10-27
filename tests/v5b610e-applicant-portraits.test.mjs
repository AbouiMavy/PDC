import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preparePortraitUploadIntent,transferAuthorizedPortraits} from '../src/features/adhesion/portrait-upload-intent-v5b610e.mjs';
import {createApplicantPortraitPermissionService} from '../backend/pdc-api/src/applicant-portrait-permission-v5b610e.mjs';
const ID1='1903c0e5-3315-4cdc-9e13-2d01bfed2d49';
const ID2='bcb2a8fd-5148-497d-bd03-b5d7c385d91e';
const NOW=1_800_000_000_000;
const file=(type='image/png',size=300)=>({type,size,async arrayBuffer(){return new Uint8Array(size).buffer;}});
const grant=(slot,id=ID1,token='a'.repeat(64))=>({slot,cardRequestId:id,uploadToken:token,expiresAt:NOW+300000});

test('sans demande de carte aucune photo nécessaire, aucun plan',()=>assert.deepEqual(preparePortraitUploadIntent({requestCard:false}),[]));
test('demande de carte exige une photo conforme',()=>assert.throws(()=>preparePortraitUploadIntent({requestCard:true}),/PDC_PHOTO_MEMBER_REQUIRED_OR_INVALID/));
test('un seul adhérent produit une seule entrée',()=>assert.equal(preparePortraitUploadIntent({requestCard:true,photoMember:file()}).length,1));
test('couple nécessite deux photos distinctes',()=>assert.throws(()=>preparePortraitUploadIntent({requestCard:true,isCouple:true,photoMember:file()}),/PDC_PHOTO_PARTNER_REQUIRED_OR_INVALID/));
test('couple donne deux slots distincts',()=>assert.deepEqual(preparePortraitUploadIntent({requestCard:true,isCouple:true,photoMember:file(),photoPartner:file()}).map(x=>x.slot),['member','partner']));
test('format ou taille non autorisés bloqués avant dépôt',()=>{
 for(const img of [file('application/pdf'),file('image/png',5242881),file('image/jpeg',0)])
  assert.throws(()=>preparePortraitUploadIntent({requestCard:true,photoMember:img}));
});
test('sans autorisation du serveur aucun appel réseau',async()=>{
 let n=0; const plan=preparePortraitUploadIntent({requestCard:true,photoMember:file()});
 await assert.rejects(transferAuthorizedPortraits({plan,grants:[],send:async()=>n++}),/PDC_UPLOAD_GRANTS_MISSING/);assert.equal(n,0);
});
test('le jeton expiré bloque tout envoi',async()=>{
 let n=0;const plan=preparePortraitUploadIntent({requestCard:true,photoMember:file()});
 await assert.rejects(transferAuthorizedPortraits({plan,grants:[{...grant('member'),expiresAt:NOW-1}],send:async()=>n++,now:NOW}),/PDC_UPLOAD_GRANT_INVALID/);assert.equal(n,0);
});
test('deux conjoints ne peuvent partager le même numéro de demande',async()=>{
 let n=0;const plan=preparePortraitUploadIntent({requestCard:true,isCouple:true,photoMember:file(),photoPartner:file()});
 await assert.rejects(transferAuthorizedPortraits({plan,grants:[grant('member'),grant('partner')],send:async()=>n++,now:NOW}),/PDC_UPLOAD_GRANT_INVALID/);assert.equal(n,0);
});
test('une autorisation destinée au conjoint ne peut servir au déclarant',async()=>{
 let n=0;const plan=preparePortraitUploadIntent({requestCard:true,photoMember:file()});
 await assert.rejects(transferAuthorizedPortraits({plan,grants:[grant('partner')],send:async()=>n++,now:NOW}),/PDC_UPLOAD_GRANT_INVALID/);assert.equal(n,0);
});
test('envoi individuel avec une autorisation serveur simulée',async()=>{
 const plan=preparePortraitUploadIntent({requestCard:true,photoMember:file()});const called=[];
 const res=await transferAuthorizedPortraits({plan,grants:[grant('member')],now:NOW,send:async x=>{called.push(x);return {cardRequestId:x.cardRequestId,status:'stored'};}});
 assert.equal(called.length,1);assert.equal(called[0].bytes.byteLength,300);assert.deepEqual(res.map(x=>x.slot),['member']);
});
test('envoi couple avec deux autorisations serveur distinctes',async()=>{
 const plan=preparePortraitUploadIntent({requestCard:true,isCouple:true,photoMember:file(),photoPartner:file()});const calls=[];
 const res=await transferAuthorizedPortraits({plan,grants:[grant('member'),grant('partner',ID2,'b'.repeat(64))],now:NOW,send:async x=>{calls.push(x);return {cardRequestId:x.cardRequestId,status:'stored'};}});
 assert.equal(calls.length,2);assert.notEqual(calls[0].cardRequestId,calls[1].cardRequestId);assert.equal(res[1].slot,'partner');
});
test('serveur refuse un simple UUID sans jeton de paiement',async()=>{
 let n=0;const srv=createApplicantPortraitPermissionService({consumeVerifiedGrant:async()=>{n++;return null;},ingestApplicantPortrait:async()=>{n++;}});
 await assert.rejects(srv.submit({cardRequestId:ID1,uploadToken:'',imageBytes:Buffer.from('abc'),declaredMime:'image/png'}),/PDC_APPLICANT_GRANT_INVALID/);assert.equal(n,0);
});
test('serveur bloque une autorisation non liée à la demande',async()=>{
 let n=0;const srv=createApplicantPortraitPermissionService({consumeVerifiedGrant:async()=>({cardRequestId:ID2,permission:'portrait:write-once'}),ingestApplicantPortrait:async()=>{n++;}});
 await assert.rejects(srv.submit({cardRequestId:ID1,uploadToken:'A'.repeat(48),imageBytes:Buffer.from('abc'),declaredMime:'image/png'}),/PDC_APPLICANT_UPLOAD_DENIED/);assert.equal(n,0);
});
test('serveur retourne uniquement statut et identifiant opaque',async()=>{
 const srv=createApplicantPortraitPermissionService({consumeVerifiedGrant:async()=>({cardRequestId:ID1,permission:'portrait:write-once',authorizationId:ID2}),ingestApplicantPortrait:async()=>({cardRequestId:ID1,status:'stored',objectKey:'SECRET'})});
 const result=await srv.submit({cardRequestId:ID1,uploadToken:'A'.repeat(48),imageBytes:Buffer.from('abc'),declaredMime:'image/png'});
 assert.deepEqual(result,{cardRequestId:ID1,status:'stored'});
});
test('aucune route publique ni clé service_role intégrée',()=>{
 const code=readFileSync(new URL('../backend/pdc-api/src/applicant-portrait-permission-v5b610e.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/VITE_.*KEY|createServer\(|\.listen\(|app\.post\(/);
});
