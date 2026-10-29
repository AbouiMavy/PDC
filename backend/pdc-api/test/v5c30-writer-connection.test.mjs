import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateWriterConnectionV5C30} from '../src/v5c/public-writer-pool-v5c30.mjs';
const ref='abcdefghijklmnopqrst';
const url=(user,host,port=5432)=>`postgresql://${user}:secret@${host}:${port}/postgres`;
test('connexion directe : uniquement writer sur le projet configuré',()=>{
  assert.deepEqual(validateWriterConnectionV5C30({projectRef:ref,
    connectionString:url('pdc_tara_v5c_writer',`db.${ref}.supabase.co`)}),{mode:'direct'});
  assert.throws(()=>validateWriterConnectionV5C30({projectRef:ref,
    connectionString:url('postgres',`db.${ref}.supabase.co`)}));
});
test('pooler Supabase : rôle personnalisé et project ref obligatoires',()=>{
  assert.deepEqual(validateWriterConnectionV5C30({projectRef:ref,
    connectionString:url(`pdc_tara_v5c_writer.${ref}`,'aws-0-eu-west-3.pooler.supabase.com',6543)}),{mode:'pooler'});
  assert.throws(()=>validateWriterConnectionV5C30({projectRef:ref,
    connectionString:url('pdc_tara_v5c_writer.zzzzzzzzzzzzzzzzzzzz','aws-0-eu-west-3.pooler.supabase.com',6543)}));
});
test('refuse fuite vers un tiers, query SSL, compte administrateur et TCP non sécurisé',()=>{
  const invalid=[url(`pdc_tara_v5c_writer.${ref}`,'malicious.example.com',6543),
    url(`pdc_tara_v5c_writer.${ref}`,'aws-0-eu-west-3.pooler.supabase.com',6543)+'?sslmode=disable',
    url('service_role',`db.${ref}.supabase.co`),
    `http://pdc_tara_v5c_writer:secret@db.${ref}.supabase.co:5432/postgres`,
    url('pdc_tara_v5c_writer',`db.${ref}.supabase.co`,6543)];
  for(const connectionString of invalid)
    assert.throws(()=>validateWriterConnectionV5C30({connectionString,projectRef:ref}));
});

test('le rôle SQL réel est contrôlé au démarrage et la connexion non conforme fermée',async()=>{
  const {openWriterPoolV5C30}=await import('../src/v5c/public-writer-pool-v5c30.mjs');
  const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'pdc-v5c30-ca-'));
  const caFile=join(dir,'ca.pem');
  writeFileSync(caFile,'-----BEGIN CERTIFICATE-----\nFAKE DEV TEST CERTIFICATE\n-----END CERTIFICATE-----');
  let closed=false,settings;
  class FakePool {
    constructor(args){settings=args;}
    async query(){return {rows:[{role_name:'postgres'}]};}
    async end(){closed=true;}
  }
  try{
    await assert.rejects(openWriterPoolV5C30({projectRef:ref,caFile,PoolClass:FakePool,
      connectionString:url('pdc_tara_v5c_writer',`db.${ref}.supabase.co`)}),/CONNECTION_REFUSED/);
    assert.equal(closed,true);
    assert.equal(settings.ssl.rejectUnauthorized,true);
    assert.equal(settings.max,2);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
