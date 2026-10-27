// V5-C — normalisation des webhooks Tara NON authentifiés.
// Ils ne sont que des INDICES. Aucune écriture ni confirmation comptable directe.
import { createHash } from 'node:crypto';
import { V5CError } from './contracts.mjs';
import { validateTaraProductId } from './tara-server-client-v5c.mjs';
const reject=code=>{throw new V5CError(code);};
const text=(x,n)=>typeof x==='string' && x.length>0 && x.length<=n;

export function inspectUntrustedTaraWebhook(rawBody, expectedBusinessId) {
  if ((typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) ||
      Buffer.byteLength(rawBody)<2 || Buffer.byteLength(rawBody)>65536 ||
      !text(expectedBusinessId,128)) reject('PDC_TARA_WEBHOOK_INVALID');
  let v;
  try {v=JSON.parse(rawBody.toString());} catch {reject('PDC_TARA_WEBHOOK_INVALID');}
  if (!v || typeof v!=='object' || Array.isArray(v) ||
      v.businessId!==expectedBusinessId || !text(v.paymentId,200) ||
      !text(v.collectionId,200) || !text(v.status,50) ||
      !/^[A-Z_]+$/.test(v.status) || !text(v.amount,20) ||
      !/^(0|[1-9][0-9]{0,18})$/.test(v.amount)) reject('PDC_TARA_WEBHOOK_INVALID');
  validateTaraProductId(v.productId);
  // Aucune valeur de téléphone ni secret conservée ou renvoyée.
  const eventId=createHash('sha256').update(JSON.stringify([
    v.businessId,v.paymentId,v.productId,v.collectionId,v.amount,v.status,
    typeof v.changeDate==='string'?v.changeDate:''
  ])).digest('hex');
  return Object.freeze({provider:'tara',trusted:false,businessId:v.businessId,
    paymentId:v.paymentId,productId:v.productId,amount:v.amount,status:v.status,eventId,
    verification:'required'});
}
