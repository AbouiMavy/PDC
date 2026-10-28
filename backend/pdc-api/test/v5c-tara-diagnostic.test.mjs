import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const tool=new URL('../../../scripts/diagnose-v5c-tara-links.mjs',import.meta.url);
const payload={status:'SUCCESS',generalLink:'https://taramoney.com/pay/123',
 cardLink:'https://taramoney.com/card/234',whatsappLink:'https://wa.me/?text=payer',
 telegramLink:'https://t.me/share/url?url=test',dikaloLink:'https://dklo.co/share/123',
 smsLink:'sms:?body=Paiement%20PRIVE',apiKey:'SECRET_NE_JAMAIS_AFFICHER',productId:'PDC_ID_SECRET'};
const run=data=>{
 const dir=mkdtempSync(join(tmpdir(),'pdc-tara-diag-'));
 try {const path=join(dir,'links.json');writeFileSync(path,JSON.stringify(data));
  return spawnSync(process.execPath,[tool.pathname,path],{encoding:'utf8'});
 } finally {rmSync(dir,{recursive:true,force:true});}
};
test('diagnostic donne les domaines et non les URL complètes ou secrets',()=>{
 const r=run(payload);assert.equal(r.status,0);
 const data=JSON.parse(r.stdout);assert.equal(data.controle.length,5);
 assert.equal(data.controle.find(x=>x.champ==='smsLink').scheme,'sms');
 assert.equal(data.controle.find(x=>x.champ==='cardLink').host,'taramoney.com');
 for(const secret of ['SECRET_NE_JAMAIS_AFFICHER','PDC_ID_SECRET','Paiement%20PRIVE','?text=payer'])
   assert.equal(r.stdout.includes(secret),false);
 assert.equal(data.verificationPaiement,false);
});
test('un canal absent apparaît explicitement sans masquer le défaut',()=>{
 const r=run({...payload,cardLink:null});assert.equal(r.status,1);
 const data=JSON.parse(r.stdout);const card=data.controle.find(x=>x.champ==='cardLink');
 assert.equal(card.urlValidee,false);assert.equal(card.present,false);
});
test('URL d un faux fournisseur rejetée et non journalisée',()=>{
 const r=run({...payload,whatsappLink:'https://evil.example/private/token'});
 assert.equal(r.status,1);assert.equal(r.stdout.includes('evil.example'),false);
});
