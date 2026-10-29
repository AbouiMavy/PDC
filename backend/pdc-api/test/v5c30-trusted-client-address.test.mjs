import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeTrustedClientAddressV5C30} from '../src/v5c/trusted-client-address-v5c30.mjs';
const request=(addr,headers={})=>({socket:{remoteAddress:addr},headers});
test('direct: utilise uniquement le pair TCP, pas une IP inventée',()=>{
  const resolve=makeTrustedClientAddressV5C30();
  assert.equal(resolve(request('192.0.2.10')),'192.0.2.10');
  assert.throws(()=>resolve(request('192.0.2.10',{'x-forwarded-for':'203.0.113.5'})));
  assert.throws(()=>resolve(request('192.0.2.10',{forwarded:'for=203.0.113.5'})));
  assert.throws(()=>resolve(request('bad.address')));
});
test('single-proxy: refuse tout émetteur TCP non inscrit',()=>{
  const resolve=makeTrustedClientAddressV5C30({mode:'single-proxy',trustedPeers:['127.0.0.1']});
  assert.equal(resolve(request('127.0.0.1',{'x-forwarded-for':'198.51.100.9'})),'198.51.100.9');
  assert.throws(()=>resolve(request('198.51.100.12',{'x-forwarded-for':'198.51.100.9'})));
});
test('single-proxy: refuse la chaîne XFF et les valeurs ajoutées par un client',()=>{
  const resolve=makeTrustedClientAddressV5C30({mode:'single-proxy',trustedPeers:['127.0.0.1']});
  for(const x of ['198.51.100.9, 203.0.113.1','evil','', ' 198.51.100.9', '198.51.100.9 '])
    assert.throws(()=>resolve(request('127.0.0.1',{'x-forwarded-for':x})));
  assert.throws(()=>resolve(request('127.0.0.1',{'x-real-ip':'198.51.100.9','x-forwarded-for':'198.51.100.9'})));
  assert.throws(()=>resolve(request('127.0.0.1',{'cf-connecting-ip':'198.51.100.9','x-forwarded-for':'198.51.100.9'})));
});
test('proxy: configuration vide ou peer non-IP interdits',()=>{
  assert.throws(()=>makeTrustedClientAddressV5C30({mode:'single-proxy'}));
  assert.throws(()=>makeTrustedClientAddressV5C30({mode:'single-proxy',trustedPeers:['proxy.local']}));
  assert.throws(()=>makeTrustedClientAddressV5C30({mode:'automatic'}));
});
