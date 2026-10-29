import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPreflight, CHECKS} from '../scripts/v5c28-preflight.mjs';
const root=join(fileURLToPath(new URL('.', import.meta.url)),'..');
const contents=(s)=>readFileSync(new URL(s,import.meta.url),'utf8');
const stage=()=>mkdtempSync(join(tmpdir(),'pdc-v5c28-'));
const put=(root,path,s)=>{const dest=join(root,path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,s);};

test('huit éléments indispensables sont contrôlés sans réseau',()=>{
  assert.equal(CHECKS.length,8);
  const x=runPreflight(stage());
  assert.equal(x.databaseInspected,false);
  assert.equal(x.paymentsInitiated,false);
  assert.equal(x.success,false);
  assert.equal(x.checks.filter(v=>v.ok).length,0);
});

test('absence de migration ou de garde-fou détectée avant toute utilisation',()=>{
  const dir=stage();
  try {
    put(dir,CHECKS[0].file,'CREATE TABLE pdc_private.tara_checkout_intents_v5c (id uuid);');
    const r=runPreflight(dir);
    assert.equal(r.checks[0].ok,false);
    assert.match(r.checks[0].detail,/Contrats absents/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('le montage HTTP ne peut pas effectuer listen() au chargement',()=>{
  const dir=stage();
  try {
    const item=CHECKS.find(x=>x.id==='no-live-listen');
    put(dir,item.file,"const issueLinks=false, enabled=false, environment='disabled';\nserver.listen(8000);");
    assert.equal(runPreflight(dir).checks.find(x=>x.id==='no-live-listen').ok,false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('le contrôle SQL des cinq canaux ne contacte pas le prestataire et se termine par ROLLBACK',()=>{
  const sql=contents('sql/v5c28-parcours-cinq-canaux-rollback.sql');
  assert.match(sql,/^BEGIN;/m);
  assert.match(sql,/^ROLLBACK;\s*$/m);
  assert.match(sql,/FOR i IN 1\.\.5 LOOP/);
  for(const field of ['smsLink','whatsappLink','telegramLink','dikaloLink','cardLink'])
    assert.ok(sql.includes(field));
  assert.doesNotMatch(sql,/http_post|net\.http|dblink|postgres_fdw|curl|fetch\(/i);
  assert.match(sql,/status='initiated'/);
});

test('les diagnostics de catalogue et de privilèges sont uniquement en lecture',()=>{
  for(const file of ['sql/v5c28-catalogue-dev.sql','sql/v5c28-privileges-dev.sql']) {
    const s=contents(file);
    assert.match(s,/BEGIN TRANSACTION READ ONLY;/);
    assert.match(s,/ROLLBACK;/);
    assert.doesNotMatch(s,/\b(?:INSERT|UPDATE|DELETE|ALTER TABLE|CREATE ROLE|GRANT EXECUTE|DROP TABLE)\s+/i);
  }
});

test('les tests ne contiennent pas de secrets d authentification',()=>{
  const s=contents('sql/v5c28-parcours-cinq-canaux-rollback.sql');
  assert.doesNotMatch(s,/(?:sk_live_|service_role\s*[:=]\s*['"]|apiKey\s*[:=]\s*['"])/);
  assert.ok(s.includes('example.invalid'));
});
