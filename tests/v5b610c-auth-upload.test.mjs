import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAuthenticatedPortraitService, PortraitPermissionError } from '../backend/pdc-api/src/portrait-admin-auth-v5b610c.mjs';
import { validatePortraitWriterConfig } from '../backend/pdc-api/src/portrait-writer-db-v5b610c.mjs';

const id = randomUUID(),card = randomUUID();
const bytes = Buffer.from('fictive-binary-for-controller-mock');
const TOKEN='Bearer fake.token.value123';
function make({ admin=true, verify=async()=>({id}), response={assetId:randomUUID(),cardRequestId:card,status:'stored'}}={}) {
  const calls=[];
  const service=createAuthenticatedPortraitService({
    verifyUser: async token => {calls.push(['auth',token]);return verify(token);},
    adminReader: {isNationalAdmin:async actor => {calls.push(['role',actor]);return admin;}},
    ingest:{uploadForApprovedApplication:async args=>{calls.push(['ingest',args]);return response;}},
  });
  return {service,calls};
}
const args={authorization:TOKEN,cardRequestId:card,imageBytes:bytes,declaredMime:'image/png'};
test('1 absence de bearer : aucun appel auth ni base',async()=>{
 const x=make();await assert.rejects(x.service.upload({...args,authorization:undefined}),e=>e.code==='AUTH_REQUIRED');assert.deepEqual(x.calls,[]);
});
test('2 jeton invalide : aucune écriture après échec d authentification',async()=>{
 const x=make({verify:async()=>{throw new Error('INVALID_SESSION');}});
 await assert.rejects(x.service.upload(args),/INVALID_SESSION/);
 assert.ok(!x.calls.some(([k])=>k==='ingest'));
});
test('3 role national absent : refus avant traitement du portrait',async()=>{
 const x=make({admin:false}); await assert.rejects(x.service.upload(args),e=>e.code==='NOT_AUTHORIZED');
 assert.deepEqual(x.calls.map(([k])=>k),['auth','role']);
});
test('4 seul l UUID issu du service d authentification devient actorId',async()=>{
 const x=make();const response=await x.service.upload({...args,actorId:randomUUID()});
 assert.deepEqual(x.calls[2][1].actorId,id);assert.equal(response.status,'stored');
});
test('5 erreur de demande invalide avant ecriture (après accès admin)',async()=>{
 const x=make(); await assert.rejects(x.service.upload({...args,cardRequestId:'invalid'}),/PDC_INVALID_CARD_REQUEST/);
 assert.ok(!x.calls.some(([k])=>k==='ingest'));
});
test('6 image trop grande rejetee, sans reservation',async()=>{
 const x=make();await assert.rejects(x.service.upload({...args,imageBytes:Buffer.alloc(5*1024*1024+1)}),/PDC_INVALID_PORTRAIT_SIZE/);
 assert.ok(!x.calls.some(([k])=>k==='ingest'));
});
test('7 type interdit avant ingestion',async()=>{
 const x=make();await assert.rejects(x.service.upload({...args,declaredMime:'image/svg+xml'}),/PDC_UNSUPPORTED_PORTRAIT_TYPE/);
 assert.ok(!x.calls.some(([k])=>k==='ingest'));
});
test('8 pas de retour de cle Storage ni infos personnelles',async()=>{
 const x=make({response:{assetId:randomUUID(),cardRequestId:card,status:'stored',objectKey:'private/hidden',serviceKey:'NEVER'}});
 const v=await x.service.upload(args); assert.equal('objectKey' in v,false); assert.equal('serviceKey' in v,false);
});
test('9 une personne peut traiter deux demandes de couple distinctes',async()=>{
 const x=make();const idB=randomUUID();await x.service.upload(args);await x.service.upload({...args,cardRequestId:idB});
 assert.equal(x.calls.filter(([k])=>k==='ingest').length,2);assert.equal(x.calls.filter(([k])=>k==='ingest')[1][1].cardRequestId,idB);
});
test('10 config PG writer refuse le même rôle que lecteur et les roles privilégiés',()=>{
 const base={PDC_PG_CA_FILE:'/tmp/no-file',DATABASE_URL:'postgresql://x:pw@localhost/postgres'};
 for (const login of ['postgres','pdc_api_runtime_v5b3.rvgpnmznhzwlzqyefahd','pdc_portrait_writer_v5b610']) {
  assert.throws(()=>validatePortraitWriterConfig({...base,PDC_PORTRAIT_DATABASE_URL:`postgresql://${login}:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`}),/PDC_PORTRAIT_WRITER_URL_DENIED/);
 }
});
test('11 config PG writer accepte uniquement compte dédié et projet validé',()=>{
 const u='postgresql://pdc_portrait_upload_runtime_v5b610c.rvgpnmznhzwlzqyefahd:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
 assert.equal(validatePortraitWriterConfig({PDC_PORTRAIT_DATABASE_URL:u,PDC_PG_CA_FILE:'/tmp/root.crt'}).connectionString,u);
});
test('12 refus connection sans CA vérifiée',()=>{
 assert.throws(()=>validatePortraitWriterConfig({PDC_PORTRAIT_DATABASE_URL:'url'}),/PDC_PORTRAIT_WRITER_CONFIG_MISSING/);
});
test('13 refus de monter route de POST dans serveur readonly',async()=>{
 const {readFile}=await import('node:fs/promises');
 const app=await readFile(new URL('../backend/pdc-api/src/app.mjs',import.meta.url),'utf8');
 assert.ok(!app.includes('portrait-admin-auth-v5b610c'));assert.ok(!app.includes('/v1/admin/portraits/upload'));
});
test('14 normalisation et accès au service restent séparés des clés service_role',async()=>{
 const {readFile}=await import('node:fs/promises');
 const auth=await readFile(new URL('../backend/pdc-api/src/portrait-admin-auth-v5b610c.mjs',import.meta.url),'utf8');
 assert.ok(!auth.includes('SUPABASE_SERVICE_ROLE_KEY')); assert.ok(!auth.includes('PDC_PORTRAIT_DATABASE_URL'));
});
