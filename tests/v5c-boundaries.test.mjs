import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const file=path=>new URL(`../${path}`,import.meta.url);
test('V5-C core is strictly under backend and no existing public entry modified', {skip: !existsSync(file('backend/pdc-api/src/index.mjs'))},()=>{
 for(const name of ['contracts.mjs','renewals.mjs','donations.mjs','reconciliation.mjs','tara-boundary.mjs','event-processor.mjs']) {
   assert.equal(existsSync(file(`backend/pdc-api/src/v5c/${name}`)),true);
 }
 const index=readFileSync(file('backend/pdc-api/src/index.mjs'),'utf8');
 const app=readFileSync(file('backend/pdc-api/src/app.mjs'),'utf8');
 assert.doesNotMatch(index,/v5c|tara/i);
 assert.doesNotMatch(app,/v1\/checkout|v1\/tara|v5c/i);
});
test('public React does not load Tara SDK or publish Tara keys', {skip: !existsSync(file('src/App.jsx'))},()=>{
 for(const name of ['src/App.jsx','src/pages/Adhesion.jsx','src/components/DonForm/DonForm.jsx','vite.config.js']){
   const s=readFileSync(file(name),'utf8');
   assert.doesNotMatch(s,/@taramoney\/react-sdk|VITE_TARA_SECRET|TARA_WEBHOOK_TOKEN|TARA_PRIVATE_KEY/);
 }
});
test('provider events require verification and no accidental public grants',()=>{
 const s=readFileSync(file('backend/pdc-api/src/v5c/event-processor.mjs'),'utf8');
 assert.match(s,/verifyProviderEvent/);
 assert.match(s,/withTransaction/);
 assert.match(s,/insertEventOnce/);
 const info=readFileSync(file('README-V5C-C1-C6.md'),'utf8');
 assert.match(info,/pas encore la V5-C complète/);
});
