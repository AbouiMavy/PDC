import test from 'node:test';import assert from 'node:assert/strict';
import {makeTurnstileVerifierV5C29} from '../src/v5c/turnstile-verifier-v5c29.mjs';
import {makePgPublicRateLimiterV5C29} from '../src/v5c/public-rate-limit-v5c29.mjs';
const opts={secret:'Z'.repeat(40),expectedHostname:'dev.example.test',enabled:true,environment:'sandbox'};
test('Turnstile : désactivé sans double opt-in',()=>assert.throws(()=>makeTurnstileVerifierV5C29({...opts,enabled:false})));
test('Turnstile : succès nécessite hostname et action exacte',async()=>{
  let count=0;
  const fetchImpl=async(url,arg)=>{count++;assert.match(url,/challenges.cloudflare.com/);
    assert.equal(arg.method,'POST');assert.match(arg.body,/secret=/);
    return {ok:true,json:async()=>({success:true,hostname:'dev.example.test',action:'pdc-public-order'})};};
  const verify=makeTurnstileVerifierV5C29({...opts,fetchImpl});
  assert.equal(await verify({token:'test_token_12345678901234567890',address:'127.0.0.1'}),true);
  assert.equal(count,1);assert.equal(await verify({token:'short'}),false);assert.equal(count,1);
});
test('Turnstile : refus d une autre action, d un autre hostname ou d une panne',async()=>{
  const mk=(obj)=>makeTurnstileVerifierV5C29({...opts,fetchImpl:async()=>({ok:true,json:async()=>obj})});
  assert.equal(await mk({success:true,hostname:'evil.test',action:'pdc-public-order'})({token:'t'.repeat(32)}),false);
  assert.equal(await mk({success:true,hostname:'dev.example.test',action:'other'})({token:'t'.repeat(32)}),false);
  const fail=makeTurnstileVerifierV5C29({...opts,fetchImpl:async()=>{throw Error('network');}});
  assert.equal(await fail({token:'t'.repeat(32)}),false);
});
test('rate limit : rôle writer requis avant toute mutation',async()=>{
  const f=makePgPublicRateLimiterV5C29({pool:{query:async()=>({rows:[{role_name:'postgres'}]})},
    hmacSecret:'S'.repeat(40),enabled:true,environment:'sandbox'});
  await assert.rejects(f,/ROLE_INVALID/);
});
test('rate limit : SQL paramétré, HMAC au lieu de l IP brute',async()=>{
  const calls=[];
  const pool={query:async(sql,p)=>{calls.push({sql,p});return p?{rows:[{allowed:true}]}:{rows:[{role_name:'pdc_tara_v5c_writer'}]};}};
  const check=await makePgPublicRateLimiterV5C29({pool,hmacSecret:'S'.repeat(40),enabled:true,environment:'sandbox'});
  assert.equal(await check({address:'127.0.0.1'}),true);
  assert.deepEqual(calls[1].p[1],5);assert.match(calls[1].p[0],/^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(calls[1]),/127\.0\.0\.1/);
});
test('rate limit : fail closed',async()=>{
  const pool={query:async(sql,p)=>p?Promise.reject(Error('fail')):{rows:[{role_name:'pdc_tara_v5c_writer'}]}};
  const check=await makePgPublicRateLimiterV5C29({pool,hmacSecret:'S'.repeat(40),enabled:true,environment:'sandbox'});
  assert.equal(await check({address:'127.0.0.1'}),false);
});
