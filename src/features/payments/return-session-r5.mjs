// R5 : simple reprise de présentation après aller-retour fournisseur dans le MÊME onglet.
// Un accusé PDC reste NON PROBANT, quelles que soient les données de l'onglet.
import {makePendingReceiptV5C44} from './manual-receipt-v5c44.mjs';
const KEY='pdc.r5.pending.return';
const TTL_MS=60*60*1000;
const kinds=Object.freeze({donation:'don',membership:'adhesion'});
export function savePendingReturnR5(source,result,{storage=globalThis.sessionStorage,now=Date.now()}={}) {
  if(!Object.hasOwn(kinds,source))throw Error('PDC_R5_RETURN_SOURCE_INVALID');
  const r=makePendingReceiptV5C44(source,result);
  try {storage.setItem(KEY,JSON.stringify({source,receipt:r,expiresAt:now+TTL_MS}));return true;}
  catch {return false;} // stockage interdit : ne bloque pas le paiement, reste page neutre
}
export function readPendingReturnR5({storage=globalThis.sessionStorage,now=Date.now()}={}){
  let json;
  try {json=storage.getItem(KEY);} catch{return null;}
  if(typeof json!=='string'||json.length>1200)return null;
  try{
    const x=JSON.parse(json);
    if(!x||!Object.hasOwn(kinds,x.source)||!Number.isFinite(x.expiresAt)||x.expiresAt<=now||x.expiresAt>now+TTL_MS){
      try{storage.removeItem(KEY);}catch{}return null;
    }
    const r=x.receipt;
    if(r?.source!==x.source||r?.stage!=='awaiting_manual_verification'||r.paymentConfirmed!==false||r.membershipGranted!==false)return null;
    return {source:x.source,kind:kinds[x.source],receipt:makePendingReceiptV5C44(x.source,{
      paymentId:r.paymentId,productId:r.productId, grossAmountXaf:r.amountXaf,
      status:r.orderStatus,currency:'XAF',paymentConfirmed:false,membershipGranted:false})};
  }catch{return null;}
}
