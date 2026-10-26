import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'abcdefghi.abcdefgh.abcdefgh';
const headers = { Authorization: `Bearer ${TOKEN}` };

async function fixture({ isAdmin=true }={}) {
  const calls=[];
  const app=createApp({
    verifyUser: async token => { calls.push(['auth',token]); return {id:USER}; },
    repository: {
      async isNationalAdmin(id){calls.push(['role',id]);return isAdmin;},
      async cardPreparationQueue(id,offset){calls.push(['cards',id,offset]);return [{
        card_request_id:'22222222-2222-4222-8222-222222222222',
        member_number:'F-PDC-I-000123',card_variant:'diaspora',requested_format:'digital',
        portrait_registered:false,
      }];},
    },
    allowedOrigins:['http://127.0.0.1:5175'],
  });
  await new Promise(ok=>app.listen(0,'127.0.0.1',ok));
  return { url:`http://127.0.0.1:${app.address().port}`,calls,
    close:()=>new Promise(ok=>app.close(ok)) };
}

test('Carte refusée sans jeton (401) avant la base',async()=>{
  const f=await fixture();try{
    const r=await fetch(f.url+'/v1/admin/cards?offset=0');
    assert.equal(r.status,401);assert.deepEqual(f.calls,[]);
  }finally{await f.close();}
});
test('Authentification sans rôle national : 403 sans lire les cartes',async()=>{
  const f=await fixture({isAdmin:false});try{
    const r=await fetch(f.url+'/v1/admin/cards?offset=0',{headers});
    assert.equal(r.status,403);assert.equal(f.calls.some(x=>x[0]==='cards'),false);
  }finally{await f.close();}
});
test('Compte national reçoit 50 par page, cache désactivé',async()=>{
  const f=await fixture();try{
    const r=await fetch(f.url+'/v1/admin/cards?offset=50',{headers});
    assert.equal(r.status,200);
    const body=await r.json();assert.equal(body.cards[0].card_variant,'diaspora');
    assert.equal(body.offset,50);assert.equal(body.pageSize,50);
    assert.equal(r.headers.get('cache-control'),'no-store');
    assert.ok(f.calls.some(x=>x[0]==='cards' && x[1]===USER && x[2]===50));
  }finally{await f.close();}
});
test('Paramètres inattendus, pages incorrectes bloqués avant la base',async()=>{
  const f=await fixture();try{
    for(const q of ['?offset=1','?offset=-50','?offset=10050','?offset=0&offset=50','?limit=5']){
      const r=await fetch(f.url+'/v1/admin/cards'+q,{headers});assert.equal(r.status,400,q);
    }
    assert.equal(f.calls.some(x=>x[0]==='cards'),false);
  }finally{await f.close();}
});
test('Écriture et endpoint d émission inexistant',async()=>{
  const f=await fixture();try{
    const post=await fetch(f.url+'/v1/admin/cards',{method:'POST',headers});
    assert.equal(post.status,405);
    const issue=await fetch(f.url+'/v1/admin/cards/issue',{headers});
    assert.equal(issue.status,404);
    assert.equal(f.calls.length,0);
  }finally{await f.close();}
});
