import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, normalizeFinanceRows } from '../src/app.mjs';

const UID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'abcdefgh.abcdefgh.abcdefgh';
const RAW = [
  {currency:'EUR',initial_fee_due_minor:'0',initial_fee_paid_minor:'0',annual_dues_due_minor:'0',annual_dues_paid_minor:'0',donations_confirmed_minor:'1500'},
  {currency:'XAF',initial_fee_due_minor:'2000',initial_fee_paid_minor:'2000',annual_dues_due_minor:'12000',annual_dues_paid_minor:'3000',donations_confirmed_minor:'500'},
];

async function makeFixture({ allowed = true, rows = RAW }={}) {
  const calls=[];
  const app=createApp({
    verifyUser: async token => { calls.push('auth'); if(token!==TOKEN) throw Error('unexpected token'); return {id:UID}; },
    repository: {
      async isNationalAdmin(){calls.push('role');return allowed;},
      async financeOverview(){calls.push('finances');return rows;},
      async dashboard(){throw Error('dashboard should not be called');},
    },
  });
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${app.address().port}`,calls,close:()=>new Promise(resolve=>app.close(resolve))};
}

test('financial endpoint refuses unauthenticated users before querying DB',async()=>{
 const f=await makeFixture();try{
  const r=await fetch(f.url+'/v1/admin/finance-overview');
  assert.equal(r.status,401);assert.deepEqual(f.calls,[]);
 }finally{await f.close();}
});

test('financial endpoint denies authenticated non-administrators',async()=>{
 const f=await makeFixture({allowed:false});try{
  const r=await fetch(f.url+'/v1/admin/finance-overview',{headers:{Authorization:`Bearer ${TOKEN}`}});
  assert.equal(r.status,403);assert.deepEqual(f.calls,['auth','role']);
 }finally{await f.close();}
});

test('national administrator receives only XAF/EUR aggregate integer strings',async()=>{
 const f=await makeFixture();try{
  const r=await fetch(f.url+'/v1/admin/finance-overview',{headers:{Authorization:`Bearer ${TOKEN}`}});
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{currencies:[
    {currency:'XAF',initialFeeDueMinor:'2000',initialFeePaidMinor:'2000',annualDuesDueMinor:'12000',annualDuesPaidMinor:'3000',donationsConfirmedMinor:'500'},
    {currency:'EUR',initialFeeDueMinor:'0',initialFeePaidMinor:'0',annualDuesDueMinor:'0',annualDuesPaidMinor:'0',donationsConfirmedMinor:'1500'},
  ]});assert.deepEqual(f.calls,['auth','role','finances']);
 }finally{await f.close();}
});

test('rejects corrupt financial data and fails closed',async()=>{
 const f=await makeFixture({rows:[{...RAW[0],donations_confirmed_minor:'-2'},RAW[1]]});try{
  const r=await fetch(f.url+'/v1/admin/finance-overview',{headers:{Authorization:`Bearer ${TOKEN}`}});
  assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'TEMPORARILY_UNAVAILABLE'});
 }finally{await f.close();}
});

test('rejects duplicate currencies and integer overflow risk without Number conversion',()=>{
 assert.throws(()=>normalizeFinanceRows([RAW[1],RAW[1]]),/duplicate/);
 const big=normalizeFinanceRows([{...RAW[1],annual_dues_due_minor:'9007199254740994'},RAW[0]]);
 assert.equal(big[0].annualDuesDueMinor,'9007199254740994');
});
