import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyWebhookRecord} from '../supabase/functions/pdc-tara-webhook/record-outcome.mjs';

const decide=classifyWebhookRecord;
test('produit reconnu et enregistré : 200 et reçu',()=>{
  assert.deepEqual([decide({data:true}).httpStatus,decide({data:true}).received],[200,true]);
});
test('réémission identique déjà dédoublonnée par SQL : même accusé de réception',()=>{
  assert.equal(decide({data:true}).received,true);
});
test('produit inconnu : aucun faux accusé de réception',()=>{
  assert.deepEqual([decide({data:false}).httpStatus,decide({data:false}).received],[422,false]);
});
test('erreur RPC : aucune confirmation de réception',()=>{
  assert.deepEqual([decide({data:true,error:{code:'PGRST002'}}).httpStatus,
    decide({data:true,error:{code:'PGRST002'}}).received],[503,false]);
});
test('réponse SQL inattendue : refus prudent',()=>{
  for(const data of [null,undefined,{},'true',0]) assert.equal(decide({data}).received,false);
});
test('Edge Function évalue le résultat RPC avant tout accusé de réception',()=>{
  const s=readFileSync(new URL('../supabase/functions/pdc-tara-webhook/index.ts',import.meta.url),'utf8');
  const rpc=s.indexOf('pdc_v5c41_record_tara_webhook_hint');
  const guard=s.indexOf('const outcome=classifyWebhookRecord({data,error})');
  assert.ok(rpc>=0 && guard>rpc);
  assert.match(s,/if\s*\(!outcome\.received\)/);
  assert.match(s,/return reply\(outcome\.httpStatus,outcome\.received\)/);
  assert.doesNotMatch(s,/if\s*\(data\s*===\s*false\)\s*return reply\(200,true\)/);
});
