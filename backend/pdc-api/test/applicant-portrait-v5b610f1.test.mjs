import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApplicantPortraitRepositoryV5B610F1 } from '../src/applicant-portrait-repository-v5b610f1.mjs';
import { createApplicantPortraitIngestV5B610F1 } from '../src/applicant-portrait-ingest-v5b610f1.mjs';
import { createApplicantPortraitDevServerV5B610F1 } from '../src/applicant-portrait-http-v5b610f1.mjs';
const CARD='1903c0e5-3315-4cdc-9e13-2d01bfed2d49';
const ASSET='bcb2a8fd-5148-497d-bd03-b5d7c385d91e';
const AUTH='80f6cf52-3377-4aaa-88f9-2b23ef2758f4';
const TOKEN='A'.repeat(43);
const key=`card-requests/${CARD}/${ASSET}.jpg`;
const bytes=Buffer.from('jpeg-test-placeholder');
const sha=createHash('sha256').update(bytes).digest('hex');
const normalized={bytes,contentType:'image/jpeg',fileBytes:bytes.length,sha256Hex:sha,width:300,height:400};
const repositoryFake=()=>({
 async reserve(){return {assetId:ASSET,authorizationId:AUTH,objectKey:key};},
 async confirm(){return true;},async cancel(){return true;},
});
const storageFake=()=>({async upload(){},async download(){return bytes;},async remove(){}});
const make=(overrides={})=>createApplicantPortraitIngestV5B610F1({
 repository:overrides.repository??repositoryFake(),storage:overrides.storage??storageFake(),
 normalize:overrides.normalize??(async()=>normalized),
});
const submit=(service=make())=>service.submit({cardRequestId:CARD,uploadToken:TOKEN,imageBytes:bytes,declaredMime:'image/jpeg'});

test('refus avant SQL si le token ne respecte pas E2',async()=>{
 let calls=0;const repo={...repositoryFake(),async reserve(){calls++}};
 await assert.rejects(make({repository:repo}).submit({cardRequestId:CARD,uploadToken:'bad',imageBytes:bytes,declaredMime:'image/jpeg'}),/PDC_PORTRAIT_TOKEN_INVALID/);
 assert.equal(calls,0);
});
test('normalisation avant consommation du grant',async()=>{
 let called=false;const repo={...repositoryFake(),async reserve(){called=true}};
 await assert.rejects(submit(make({repository:repo,normalize:async()=>{throw new Error('PDC_DECODE_FAILED')}})),/PDC_DECODE_FAILED/);
 assert.equal(called,false);
});
test('jeton E2 transmis uniquement comme SHA256 a SQL',async()=>{
 const calls=[];const repo={...repositoryFake(),async reserve(args){calls.push(args);return repositoryFake().reserve()}};
 await submit(make({repository:repo}));
 assert.equal(calls[0].tokenHash,createHash('sha256').update(TOKEN).digest('hex'));
 assert.ok(!JSON.stringify(calls).includes(TOKEN));
});
test('chemin prive et retour sans token, hash ou URL',async()=>{
 const uploads=[]; const storage={...storageFake(),async upload(...args){uploads.push(args)}};
 assert.deepEqual(await submit(make({storage})),{cardRequestId:CARD,status:'stored'});
 assert.equal(uploads[0][0],key);
});
test('usurpation du chemin Storage refusee et reservation annulee',async()=>{
 let cancelled=0;const repository={...repositoryFake(),async reserve(){return {assetId:ASSET,authorizationId:AUTH,objectKey:'my-private-file.jpg'}},async cancel(){cancelled++}};
 await assert.rejects(submit(make({repository})),/PDC_APPLICANT_STORAGE_PATH_DENIED/);
 assert.equal(cancelled,1);
});
test('integrite distante incorrecte => suppression objet puis annulation SQL',async()=>{
 const steps=[];const storage={async upload(){steps.push('upload')},async download(){steps.push('download');return Buffer.from('wrong')},async remove(){steps.push('remove')}};
 const repository={...repositoryFake(),async cancel(){steps.push('cancel')}};
 await assert.rejects(submit(make({storage,repository})),/PDC_APPLICANT_STORAGE_INTEGRITY_FAILED/);
 assert.deepEqual(steps,['upload','download','remove','cancel']);
});
test('erreur apres debut de confirmation : aucun effacement destructeur',async()=>{
 let remove=0;const storage={...storageFake(),async remove(){remove++}};
 const repository={...repositoryFake(),async confirm(){throw new Error('network unknown')}};
 await assert.rejects(submit(make({repository,storage})),/PDC_APPLICANT_CONFIRMATION_UNCERTAIN_RECONCILE/);
 assert.equal(remove,0);
});
test('erreur de stockage : cleanup, jeton consomme non recycle',async()=>{
 let cancelled=0;const storage={...storageFake(),async upload(){throw new Error('simulated error')}};
 const repository={...repositoryFake(),async cancel(){cancelled++}};
 await assert.rejects(submit(make({repository,storage})),/simulated error/);
 assert.equal(cancelled,1);
});
test('SQL reserve strictement parametre et verifie les identifiants',async()=>{
 const queries=[];
 const repo=createApplicantPortraitRepositoryV5B610F1({query:async (sql,params)=>{queries.push([sql,params]);return {rows:[{asset_id:ASSET,authorization_id:AUTH,object_key:key}]}}});
 const data=await repo.reserve({cardRequestId:CARD,tokenHash:'a'.repeat(64)});
 assert.equal(data.objectKey,key);
 assert.deepEqual(queries[0][1],[CARD,'a'.repeat(64),'image/jpeg']);
 assert.match(queries[0][0],/\$1::uuid,\$2::text,\$3::text/);
});
test('aucune requete SQL pour un hash invalide',async()=>{
 let count=0;const repo=createApplicantPortraitRepositoryV5B610F1({query:async()=>{count++}});
 await assert.rejects(repo.reserve({cardRequestId:CARD,tokenHash:'bad'}),/PDC_APPLICANT_RESERVE_INVALID/);
 assert.equal(count,0);
});
test('confirmation SQL porte sur autorisation + asset, pas actorId admin',async()=>{
 const calls=[];
 const repo=createApplicantPortraitRepositoryV5B610F1({query:async(sql,args)=>{calls.push([sql,args]);return {rows:[{confirmed:true}]}}});
 assert.equal(await repo.confirm({authorizationId:AUTH,assetId:ASSET,meta:{...normalized}}),true);
 assert.deepEqual(calls[0][1],[AUTH,ASSET,bytes.length,sha,300,400]);
});
test('HTTP refuse origine inconnue sans meme appeler ingest',async()=>{
 let n=0; const server=createApplicantPortraitDevServerV5B610F1({
  ingest:{async submit(){n++;return {status:'stored'}}},allowedOrigins:['http://127.0.0.1:5173'],
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const {port}=server.address();
  const resp=await fetch(`http://127.0.0.1:${port}/v1/dev/applicant-portrait`,{
   method:'POST',headers:{Origin:'https://untrusted.example',Authorization:`Bearer ${TOKEN}`,'Content-Type':'image/jpeg','X-PDC-Card-Request-Id':CARD},body:bytes});
  assert.equal(resp.status,403);assert.equal(n,0);
 } finally {await new Promise(resolve=>server.close(resolve))}
});
test('HTTP invalide : pas de token => aucun upload',async()=>{
 let n=0;const server=createApplicantPortraitDevServerV5B610F1({
 ingest:{async submit(){n++}},allowedOrigins:['http://127.0.0.1:5173']});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const {port}=server.address();
  const r=await fetch(`http://127.0.0.1:${port}/v1/dev/applicant-portrait`,{method:'POST',headers:{Origin:'http://127.0.0.1:5173','Content-Type':'image/png','X-PDC-Card-Request-Id':CARD},body:bytes});
  assert.equal(r.status,400); assert.equal(n,0);
 } finally {await new Promise(resolve=>server.close(resolve))}
});
test('HTTP accepte preuve + image avec simulateur, sans fuite de cle ou chemin',async()=>{
 let n=0;const server=createApplicantPortraitDevServerV5B610F1({
 ingest:{async submit(args){n++;assert.equal(args.uploadToken,TOKEN);assert.ok(Buffer.isBuffer(args.imageBytes));return {cardRequestId:CARD,status:'stored'}}},
 allowedOrigins:['http://127.0.0.1:5173']});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const {port}=server.address();const r=await fetch(`http://127.0.0.1:${port}/v1/dev/applicant-portrait`,{
    method:'POST',headers:{Origin:'http://127.0.0.1:5173',Authorization:`Bearer ${TOKEN}`,'Content-Type':'image/jpeg','X-PDC-Card-Request-Id':CARD},body:bytes});
  assert.equal(r.status,200);assert.equal(n,1);
  assert.deepEqual(await r.json(),{cardRequestId:CARD,status:'stored'});
 } finally {await new Promise(resolve=>server.close(resolve))}
});
