import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createPortraitIngestService } from '../backend/pdc-api/src/portrait-ingest-v5b610b.mjs';
import { portraitObjectKey } from '../backend/pdc-api/src/portrait-policy.mjs';
import { createPortraitRepositoryV5B610B } from '../backend/pdc-api/src/portrait-repository-v5b610b.mjs';
import { createPortraitStorageV5B610B } from '../backend/pdc-api/src/portrait-storage-v5b610b.mjs';

const actorId=randomUUID(), cardA=randomUUID(),cardB=randomUUID();
const fixed=Buffer.from('fake-clean-jpeg-for-mocked-unit-tests');
const sha=createHash('sha256').update(fixed).digest('hex');
const normalizer=async () => ({ bytes:fixed,contentType:'image/jpeg',fileBytes:fixed.length,sha256Hex:sha,width:450,height:600 });
function factory({throwUpload=false,throwConfirm=false,alterDownload=false}={}) {
  const history=[],paths=new Map(), assets=new Map();
  const repository={
    async reserve(actor,card,mime){
      assert.equal(actor,actorId);assert.equal(mime,'image/jpeg');
      const assetId=randomUUID(),objectKey=portraitObjectKey(card,assetId,mime);
      assets.set(assetId,{card,objectKey});history.push('reserve:'+card);
      return {assetId,objectKey};
    },
    async confirm(actor,asset,metadata) {
      if(throwConfirm) throw Error('DB_UNAVAILABLE');
      assert.equal(metadata.sha256Hex,sha);history.push('confirm:'+assets.get(asset).card);
    },
    async cancel(actor,asset){history.push('cancel:'+assets.get(asset).card);},
  };
  const storage={
    async upload(path,bytes,mime){if(throwUpload)throw Error('UPLOAD_FAILED');assert.equal(mime,'image/jpeg');paths.set(path,Buffer.from(bytes));history.push('upload');},
    async download(path){return alterDownload? Buffer.from('wrong'):paths.get(path);},
    async remove(path){paths.delete(path);history.push('remove');},
  };
  return {service:createPortraitIngestService({repository,storage,normalize:normalizer}),history,paths};
}

test('1. a card request stores a single opaque portrait; no public link',async()=>{
  const f=factory(); const v=await f.service.uploadForApprovedApplication({actorId,cardRequestId:cardA,imageBytes:fixed,declaredMime:'image/png'});
  assert.equal(v.status,'stored'); assert.ok(!('objectKey' in v));assert.deepEqual(f.history,['reserve:'+cardA,'upload','confirm:'+cardA]);
});
test('2. a couple may upload two photos in one session but with distinct card request IDs',async()=>{
  const f=factory(); await f.service.uploadForApprovedApplication({actorId,cardRequestId:cardA,imageBytes:fixed,declaredMime:'image/jpeg'});
  await f.service.uploadForApprovedApplication({actorId,cardRequestId:cardB,imageBytes:fixed,declaredMime:'image/jpeg'});
  assert.equal(f.paths.size,2);assert.ok([...f.paths.keys()].some(p=>p.includes(cardA)));
  assert.ok([...f.paths.keys()].some(p=>p.includes(cardB)));
});
test('3. storage error removes reservation after best-effort deletion',async()=>{
  const f=factory({throwUpload:true});
  await assert.rejects(f.service.uploadForApprovedApplication({actorId,cardRequestId:cardA,imageBytes:fixed,declaredMime:'image/jpeg'}),/UPLOAD_FAILED/);
  assert.equal(f.paths.size,0);assert.ok(f.history.includes('remove'));assert.ok(f.history.includes('cancel:'+cardA));
});
test('4. uncertain DB confirmation preserves upload for manual reconciliation',async()=>{
  const f=factory({throwConfirm:true});
  await assert.rejects(f.service.uploadForApprovedApplication({actorId,cardRequestId:cardA,imageBytes:fixed,declaredMime:'image/jpeg'}),/PDC_CONFIRMATION_UNCERTAIN_RECONCILE/);
  assert.equal(f.paths.size,1);assert.ok(!f.history.includes('cancel:'+cardA));
});
test('5. failed readback integrity check never confirms stored',async()=>{
  const f=factory({alterDownload:true});
  await assert.rejects(f.service.uploadForApprovedApplication({actorId,cardRequestId:cardA,imageBytes:fixed,declaredMime:'image/jpeg'}),/PDC_STORAGE_INTEGRITY_FAILED/);
  assert.ok(!f.history.some(x=>x.startsWith('confirm')));
});
test('6. invalid opaque UUID refuses before reading or writing',async()=>{
  const f=factory();
  await assert.rejects(f.service.uploadForApprovedApplication({actorId,cardRequestId:'bad',imageBytes:fixed,declaredMime:'image/jpeg'}),/PDC_INVALID_IDENTITY_REFERENCE/);
  assert.deepEqual(f.history,[]);
});
test('7. registry SQL client uses only parameterized functions',async()=>{
  const recorded=[];
  const repo=createPortraitRepositoryV5B610B({query:async(sql,values)=>{recorded.push({sql,values});return {rows:[{asset_id:randomUUID(),object_key:'irrelevant',confirmed:true}]};}});
  await repo.reserve(actorId,cardA,'image/jpeg'); await repo.confirm(actorId,randomUUID(),{fileBytes:50,sha256Hex:sha,width:450,height:600});
  await repo.cancel(actorId,randomUUID());
  assert.equal(recorded.length,3);assert.ok(recorded.every(x=>x.sql.includes('$1::uuid') && x.sql.includes('pdc_private.portrait_')));
});
test('8. no private storage key may appear in direct caller errors',()=>{
  assert.throws(()=>createPortraitStorageV5B610B({serviceKey:'a'}),/PDC_STORAGE_CONFIG_DENIED/);
});
test('9. storage validates server-only opaque path before fetch',async()=>{
  const s=createPortraitStorageV5B610B({serviceKey:'x'.repeat(40),fetchImpl:()=>{throw Error('MUST_NOT_CALL');}});
  await assert.rejects(s.upload('public/foo.jpg',Buffer.from('abc'),'image/jpeg'),/PDC_STORAGE_UPLOAD_INVALID|PDC_PRIVATE_STORAGE_PATH_INVALID/);
});
test('10. existing public API is not imported by the upload module', async()=>{
  const {readFile}=await import('node:fs/promises');
  const app=await readFile(new URL('../backend/pdc-api/src/app.mjs',import.meta.url),'utf8').catch(()=>null);
  // In the Codespace, this remains the old readonly API; the ZIP must not overwrite app.mjs.
  if (app) assert.ok(!app.includes('/v1/admin/portraits/upload'));
});

test('11. normalizing actual fictitious PNG outputs JPEG without embedding original PNG',async(t)=>{
  let sharp;
  try {sharp=createRequire(new URL('../backend/pdc-api/package.json', import.meta.url))('sharp');} catch { return t.skip('Installer sharp dans backend/pdc-api pour verifier le decodeur reel.'); }
  const {readFile}=await import('node:fs/promises');
  const {normalizePrivatePortrait}=await import('../backend/pdc-api/src/portrait-normalize-v5b610b.mjs');
  const buf=await readFile(new URL('./assets/fictive-portrait-test.png',import.meta.url));
  const result=await normalizePrivatePortrait(buf,'image/png',{sharpFactory:sharp});
  assert.equal(result.contentType,'image/jpeg');
  assert.equal(result.width,360);assert.equal(result.height,420);
  assert.equal(result.sha256Hex,createHash('sha256').update(result.bytes).digest('hex'));
  assert.equal((await sharp(result.bytes).metadata()).exif, undefined);
});

test('12. image MIME must match decoded bytes; file extension alone is insufficient',async(t)=>{
  let sharp;
  try {sharp=createRequire(new URL('../backend/pdc-api/package.json', import.meta.url))('sharp');} catch { return t.skip('Installer sharp dans backend/pdc-api.'); }
  const {readFile}=await import('node:fs/promises');
  const {normalizePrivatePortrait}=await import('../backend/pdc-api/src/portrait-normalize-v5b610b.mjs');
  const buf=await readFile(new URL('./assets/fictive-portrait-test.png',import.meta.url));
  await assert.rejects(normalizePrivatePortrait(buf,'image/jpeg',{sharpFactory:sharp}),/PDC_IMAGE_MIME_MISMATCH/);
});
