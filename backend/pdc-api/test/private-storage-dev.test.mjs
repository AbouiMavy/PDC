import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateStorageDev, DEV_PROJECT_REF, PORTRAIT_BUCKET } from '../src/private-storage-dev.mjs';
import { smoke } from '../scripts/check-private-portraits-dev.mjs';

const KEY = 'test-jwt-with-no-real-access-0123456789';
const IMG = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0]);
const UUID = '22222222-2222-4222-8222-222222222222';
function harness({ isPublic=false, corrupt=false, maxBytes=5242880, mime=['image/png','image/jpeg'],
                   anonymousReadable=false, failUpload=false, failRemove=false }={}) {
  const store = new Map();
  const calls=[];
  async function fetchImpl(url, opts) {
    const p = new URL(url).pathname;
    calls.push([opts.method,p,opts.headers]);
    const root = `/storage/v1`;
    if (p === `${root}/bucket/${PORTRAIT_BUCKET}`)
      return Response.json({ id: PORTRAIT_BUCKET, public:isPublic, file_size_limit:maxBytes,
          allowed_mime_types:mime });
    const key = p.split(`${PORTRAIT_BUCKET}/`)[1];
    const anonymous = !opts.headers?.Authorization;
    if (p.includes('/object/public/') || (p.includes('/object/authenticated/') && anonymous)) {
      return anonymousReadable ? new Response(IMG,{status:200}) : new Response('Unauthorized',{status:403});
    }
    if (opts.method === 'POST') {
      if(failUpload) return new Response('Blocked',{status:409});
      if (store.has(key)) return new Response('Already exists',{status:409});
      store.set(key,new Uint8Array(opts.body));return Response.json({Key:key});
    }
    if (opts.method === 'DELETE') {
      if(failRemove) return new Response('Broken',{status:503});
      store.delete(key);return new Response('',{status:200});
    }
    if(opts.method === 'GET') return store.has(key)
      ? new Response(corrupt ? new Uint8Array([1,2,3]) : store.get(key),{status:200})
      : new Response('Missing',{status:404});
    return new Response('',{status:500});
  }
  return {storage:createPrivateStorageDev({key:KEY,fetchImpl}),store,calls};
}

test('credentials absent blocked',()=> assert.throws(()=>createPrivateStorageDev({key:''}), /MISSING/));
test('known project only, URL constant',async()=>{
  const f=harness();await f.storage.verifyBucket();
  assert.equal(f.calls[0][1],`/storage/v1/bucket/${PORTRAIT_BUCKET}`);
  assert.ok(DEV_PROJECT_REF.startsWith('rvgpnm'));
});
test('private bucket mandatory',async()=>{
  await assert.rejects(harness({isPublic:true}).storage.verifyBucket(),/PRIVATE/);
});
test('type allowlist mandatory',async()=>{
  await assert.rejects(harness({mime:['image/png']}).storage.verifyBucket(),/MIME/);
});
test('maximum 5 MiB bucket mandatory',async()=>{
  await assert.rejects(harness({maxBytes:10485760}).storage.verifyBucket(),/SIZE/);
});
test('random smoke path only: not a real member folder',async()=>{
  const f=harness();
  await assert.rejects(f.storage.uploadDummy(`card-requests/${UUID}/fake.png`, IMG),/KEY/);
});
test('reject empty image and too-large image',async()=>{
  const f=harness();
  await assert.rejects(f.storage.uploadDummy(`dev-smoketests/${UUID}.png`,new Uint8Array()),/INVALID/);
  await assert.rejects(f.storage.uploadDummy(`dev-smoketests/${UUID}.png`,new Uint8Array(5242881)),/INVALID/);
});
test('realistic happy path uploads, reads, restricts public, deletes and confirms absence',async()=>{
  const f=harness(),log=[];
  await smoke({storage:f.storage,bytes:IMG,id:UUID,log:x=>log.push(x)});
  assert.equal(log.length,5);assert.equal(f.store.size,0);
  assert.equal(f.calls.filter(x=>x[0]==='POST').length,1);
  assert.equal(f.calls.filter(x=>x[0]==='DELETE').length,1);
  assert.equal(f.calls.filter(x=>x[1].includes('/object/public/'))[0][2].Authorization,undefined);
});
test('public access is a critical error, but file is still cleaned up',async()=>{
  const f=harness({anonymousReadable:true});
  await assert.rejects(smoke({storage:f.storage,bytes:IMG,id:UUID,log:()=>{}}),/PUBLIC_ACCESS/);
  assert.equal(f.store.size,0);
});
test('digest mismatch blocks success and cleans up',async()=>{
  const f=harness({corrupt:true});
  await assert.rejects(smoke({storage:f.storage,bytes:IMG,id:UUID,log:()=>{}}),/HASH_MISMATCH/);
  assert.equal(f.store.size,0);
});
test('rejected upload attempts cleanup for uncertain network state',async()=>{
  const f=harness({failUpload:true});
  await assert.rejects(smoke({storage:f.storage,bytes:IMG,id:UUID,log:()=>{}}),/UPLOAD_FAILED/);
  assert.equal(f.calls.filter(x=>x[0]==='DELETE').length,1);
});
test('failure to delete is surfaced with opaque cleanup key',async()=>{
  const f=harness({failRemove:true});
  await assert.rejects(smoke({storage:f.storage,bytes:IMG,id:UUID,log:()=>{}}),/MANUAL_ACTION/);
});
