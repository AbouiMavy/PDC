import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/app.mjs';

const UUID='11111111-1111-4111-8111-111111111111';
const BATCH='22222222-2222-4222-8222-222222222222';
const TOKEN='abcdefghi.abcdefgh.abcdefgh';

async function fixture({admin=true}={}) {
  const calls=[];
  const app=createApp({
    verifyUser:async token=>{calls.push(['verify',token]);return {id:UUID};},
    repository:{
      async isNationalAdmin(id){calls.push(['role',id]);return admin;},
      async dashboard(){return {applications_to_review:'0',active_memberships:'0'};},
      async financeOverview(){return ['XAF','EUR'].map(currency=>({currency,
        initial_fee_due_minor:'0',initial_fee_paid_minor:'0',annual_dues_due_minor:'0',
        annual_dues_paid_minor:'0',donations_confirmed_minor:'0'}));},
      async reviewBatches(id){calls.push(['batches',id]);return [{batch_id:BATCH,status:'open',members_in_batch:'1'}];},
      async reviewMembers(id,batch,offset){calls.push(['members',id,batch,offset]);return [{membership_id:UUID,member_number:'M-PDC-I-000001'}];},
    },
    allowedOrigins:['http://127.0.0.1:5175'],
  });
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  return {calls, url:`http://127.0.0.1:${app.address().port}`,
    close:()=>new Promise(resolve=>app.close(resolve))};
}
const bearer={Authorization:`Bearer ${TOKEN}`};

test('Unauthenticated review listing denied before querying DB',async()=>{
  const x=await fixture();try{
    const r=await fetch(x.url+'/v1/admin/reviews');
    assert.equal(r.status,401);assert.deepEqual(x.calls,[]);
  }finally{await x.close();}
});
test('Valid session without national role cannot read membership review lists',async()=>{
  const x=await fixture({admin:false});try{
    const r=await fetch(x.url+'/v1/admin/reviews',{headers:bearer});
    assert.equal(r.status,403);
    const m=await fetch(x.url+`/v1/admin/reviews/${BATCH}?offset=0`,{headers:bearer});
    assert.equal(m.status,403);
    assert.equal(x.calls.some(c=>['members','batches'].includes(c[0])),false);
  }finally{await x.close();}
});
test('National admin lists batches and paged members with exact parameters',async()=>{
  const x=await fixture();try{
    const b=await fetch(x.url+'/v1/admin/reviews',{headers:bearer});
    assert.equal(b.status,200);assert.equal((await b.json()).batches[0].batch_id,BATCH);
    const m=await fetch(x.url+`/v1/admin/reviews/${BATCH}?offset=50`,{headers:bearer});
    assert.equal(m.status,200);assert.equal((await m.json()).members[0].member_number,'M-PDC-I-000001');
    assert.ok(x.calls.some(c=>c[0]==='members'&&c[2]===BATCH&&c[3]===50));
    assert.equal(m.headers.get('cache-control'),'no-store');
  }finally{await x.close();}
});
test('Invalid pages and extra query params cannot reach review repository',async()=>{
  const x=await fixture();try{
    for(const tail of [`${BATCH}?offset=1`,`${BATCH}?offset=-50`,`${BATCH}?offset=999999`,
      `${BATCH}?limit=200`,`${BATCH}?offset=0&offset=50`]){
      const r=await fetch(x.url+'/v1/admin/reviews/'+tail,{headers:bearer});
      assert.equal(r.status,400,tail);
    }
    assert.equal(x.calls.some(c=>c[0]==='members'),false);
  }finally{await x.close();}
});
test('All writes remain prohibited for review endpoints',async()=>{
  const x=await fixture();try{
    const r=await fetch(x.url+'/v1/admin/reviews',{method:'POST',headers:bearer});
    assert.equal(r.status,405);assert.deepEqual(x.calls,[]);
  }finally{await x.close();}
});
test('Review endpoints not usable as generic arbitrary SQL paths',async()=>{
  const x=await fixture();try{
    for(const path of ['/v1/admin/reviews/anything','/v1/admin/reviews/not-a-uuid',
      '/v1/admin/reviews/'+BATCH+'/revoke']){
      const r=await fetch(x.url+path,{headers:bearer});
      assert.equal(r.status,404);
    }
  }finally{await x.close();}
});
