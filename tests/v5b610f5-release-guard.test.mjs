import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base=new URL('../', import.meta.url);
const file=p=>readFileSync(new URL(p,base),'utf8');
test('CI exige les tests React, Node, compilation et audit',()=>{
 const x=file('.github/workflows/pdc-v5b-validation.yml');
 for(const fragment of ['pull_request:','develop, main','npm ci','npm ci --prefix backend/pdc-api',
 'node --test tests/*.test.mjs','npm test --prefix backend/pdc-api',
 'npm run build','node scripts/check-v5b-release-candidate.mjs'])
 assert.ok(x.includes(fragment),fragment);
});
test('workflow ne contient ni deploiement ni permissions ecriture',()=>{
 const x=file('.github/workflows/pdc-v5b-validation.yml');
 assert.doesNotMatch(x,/vercel\s+deploy|deployments:\s*write|contents:\s*write|supabase db push/i);
});
test('controle de release signale explicitement les limitations',()=>{
 const x=file('scripts/check-v5b-release-candidate.mjs');
 assert.match(x,/formulaire en simulation/);assert.match(x,/Vercel/);
 assert.match(x,/les secrets intégrés dans le code/);
});
test('absence de migration modifiant les 18 fichiers historiques',()=>{
 const x=file('supabase/migrations/20261027001900_pdc_v5b610f4_couple_portrait_grants_dev.sql');
 assert.doesNotMatch(x,/DROP TABLE|TRUNCATE|DELETE FROM/);
 assert.match(x,/CREATE OR REPLACE FUNCTION/);
});
