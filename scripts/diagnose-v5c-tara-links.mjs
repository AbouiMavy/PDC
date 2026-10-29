#!/usr/bin/env node
// V5-C.27 - diagnostic HORS RÉSEAU et SANS détails sensibles.
// Usage: node scripts/diagnose-v5c-tara-links.mjs /tmp/tara-response.json
import {readFileSync} from 'node:fs';
import {selectTaraPaymentLink} from '../backend/pdc-api/src/v5c/tara-channel-links-v5c.mjs';
const args=process.argv.slice(2);
if(args.length!==1 || args[0].startsWith('-')) {
  process.stderr.write('Usage: node scripts/diagnose-v5c-tara-links.mjs /tmp/tara-response.json\n');
  process.exit(2);
}
let raw;
try {
  const content=readFileSync(args[0],'utf8');
  if(content.length>150000)throw new Error('TOO_LARGE');
  raw=JSON.parse(content);
  if(!raw || Array.isArray(raw) || typeof raw!=='object')throw Error('NOT_OBJECT');
} catch {
  process.stderr.write('Réponse non lisible ou invalide. Aucun appel réseau.\n');
  process.exit(2);
}
const checks=[['Mobile Money','mobile',null],['WhatsApp','tara','whatsapp'],
 ['Telegram','tara','telegram'],['Dikalo','tara','dikalo'],['Carte bancaire','carte',null]];
const results=checks.map(([label,method,messagingChannel])=>{
  const field=method==='mobile'?'smsLink':method==='carte'?'cardLink':
    `${messagingChannel}Link`;
  let valid=false,scheme=null,host=null,kind=null;
  try{
    const {paymentUrl}=selectTaraPaymentLink(raw,{method,messagingChannel});
    const parsed=new URL(paymentUrl);
    valid=true;scheme=parsed.protocol.replace(':','');
    host=parsed.hostname||null;
    kind=scheme==='sms'?'Partage SMS (Mobile Money à confirmer visuellement)':
      field==='cardLink'?'Lien carte (parcours à confirmer visuellement)':
      'Partage messagerie (destination à confirmer visuellement)';
  }catch{/* Ne jamais journaliser la valeur brute ni l'erreur détaillée */}
  return {canal:label,champ:field,present:Object.hasOwn(raw,field) && raw[field]!=null,
    urlValidee:valid,scheme,host,observation:kind??'Lien indisponible ou rejeté'};
});
const output={mode:'LOCAL_SANS_RESEAU',statusReconnu:['SUCCESS','success'].includes(raw.status),
  verificationPaiement:false,ouvertureAutomatique:false,
  controle:Object.freeze(results)};
process.stdout.write(JSON.stringify(output,null,2)+'\n');
if(!output.statusReconnu || results.some(x=>!x.urlValidee))process.exitCode=1;
