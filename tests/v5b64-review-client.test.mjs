import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminDevClient,AdminApiError} from '../src/features/admin-dev/client.mjs';
const BATCH='22222222-2222-4222-8222-222222222222';
const TOKEN='abcdefghi.abcdefgh.abcdefgh';
function fixture({badBody=false}={}){
  const calls=[];
  const fetchImpl=async (url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).includes('/auth/v1/token')) return Response.json({access_token:TOKEN});
    if(String(url).includes('/v1/admin/reviews/')) return Response.json(badBody?{members:'unsafe'}:{members:[],offset:0,pageSize:50,hasMore:false});
    if(String(url).endsWith('/v1/admin/reviews')) return Response.json({batches:[]});
    return Response.json({error:'NOT_FOUND'},{status:404});
  };
  return {client:createAdminDevClient({authOrigin:'https://pdc-test.supabase.co',
    publishableKey:'public-placeholder',fetchImpl}),calls};
}

test('Review API is not usable before session',async()=>{
  const {client,calls}=fixture();
  await assert.rejects(client.request('/v1/admin/reviews'),e=>e instanceof AdminApiError&&e.status===401);
  assert.equal(calls.length,0);
});
test('Authenticated admin client accepts batch list and bounded details',async()=>{
  const {client,calls}=fixture();await client.signIn('test@example.invalid','test-password');
  assert.deepEqual(await client.request('/v1/admin/reviews'),{batches:[]});
  const page=await client.request(`/v1/admin/reviews/${BATCH}?offset=50`);
  assert.deepEqual(page.members,[]);
  assert.equal(calls[2].options.headers.Authorization,`Bearer ${TOKEN}`);
});
test('Client rejects unexpected paths before network requests',async()=>{
  const {client,calls}=fixture();await client.signIn('test@example.invalid','test-password');
  await assert.rejects(client.request('/v1/admin/reviews/abc?offset=0'),/Unexpected administration path/);
  await assert.rejects(client.request('/v1/admin/reviews/abc/revoke'),/Unexpected administration path/);
  assert.equal(calls.length,1);
});
test('Client rejects malformed review API JSON',async()=>{
  const {client}=fixture({badBody:true});await client.signIn('test@example.invalid','test-password');
  await assert.rejects(client.request(`/v1/admin/reviews/${BATCH}?offset=0`),
    e=>e instanceof AdminApiError&&e.code==='REVIEW_BAD_RESPONSE');
});
