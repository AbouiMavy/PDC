// V5-C — corroboration stricte entre statut Tara et liste des transactions.
// Tara (réponse du support le 27/10/2026) : transactionId de la liste = notre productId.
// NE PAS confondre ce transactionId avec paymentId du webhook.
import { V5CError } from './contracts.mjs';
import { validateTaraProductId } from './tara-server-client-v5c.mjs';
const reject = code => { throw new V5CError(code); };
const XAF=/^[1-9][0-9]{0,15}$/;

/** Seules les opérations XAF sont traitées : aucune devise dans l'API de création du lien.
 * Les transactions EUR (dont couple diaspora à 40 EUR) attendent une confirmation Tara.
 */
export function evaluateTaraEvidence({productId,expectedAmountXaf,paymentChannel,mobileStatus,transactionRows,webhookHint}={}) {
  validateTaraProductId(productId);
  if (typeof expectedAmountXaf!=='string' || !XAF.test(expectedAmountXaf) ||
      !Array.isArray(transactionRows)) reject('PDC_TARA_EVIDENCE_INPUT_INVALID');
  if(paymentChannel!=='mobile') return Object.freeze({decision:'manual_review',reason:'CHANNEL_NOT_VERIFIED',productId});
  const missing = Object.freeze({decision:'not_verified',reason:'INCOMPLETE_EVIDENCE',productId});
  if (!mobileStatus || mobileStatus.productId!==productId) return missing;
  // Même un webhook SUCCESS ne constitue jamais une preuve à lui seul.
  if (webhookHint && (webhookHint.productId!==productId || webhookHint.trusted!==false ||
      webhookHint.amount!==expectedAmountXaf))
    return Object.freeze({decision:'manual_review',reason:'WEBHOOK_CONFLICT',productId});
  const rows=transactionRows.filter(row=>row?.transactionId===productId);
  if (rows.length>1) return Object.freeze({decision:'manual_review',reason:'DUPLICATE_TRANSACTION_ID',productId});
  if (rows.length===0) return missing;
  const item=rows[0];
  if (item.currency!=='XAF' || item.amount!==expectedAmountXaf)
    return Object.freeze({decision:'manual_review',reason:'FINANCIAL_MISMATCH',productId});
  if (mobileStatus.status!=='SUCCESS' || item.status!=='PAID')
    return Object.freeze({decision:'not_verified',reason:'NOT_FINAL',productId});
  return Object.freeze({decision:'corroborated',productId,amountXaf:expectedAmountXaf,
    currency:'XAF',source:'TARA_STATUS_AND_TRANSACTION_LIST',
    // Ne pas transformer directement en 'confirmed' dans payment_attempts :
    // il manque encore le rattachement durable et la transaction SQL C1-C6.
    requiresAtomicDbReconciliation:true});
}

/** Vérification bornée sur liste générale POST documentée, sans endpoint payé non spécifié. */
export async function reconcileTaraProduct({client,productId,expectedAmountXaf,paymentChannel,webhookHint,
  pageSize=20,maxPages=10}={}) {
  if (!client || typeof client.checkMobileStatus!=='function' ||
      typeof client.listTransactions!=='function' ||
      !Number.isInteger(pageSize)||pageSize<1||pageSize>100||
      !Number.isInteger(maxPages)||maxPages<1||maxPages>20)
    reject('PDC_TARA_RECONCILIATION_CONFIG_INVALID');
  // Limiter la recherche et conserver les événements contradictoires pour revue manuelle.
  if(paymentChannel!=='mobile') return Object.freeze({decision:'manual_review',reason:'CHANNEL_NOT_VERIFIED',productId});
  const mobileStatus=await client.checkMobileStatus(productId);
  let all=[];let exhausted=false;
  for(let i=0;i<maxPages;i++) {
    const rows=await client.listTransactions({start:i*pageSize,size:pageSize});
    if (!Array.isArray(rows)||rows.length>pageSize) reject('PDC_TARA_LIST_INVALID');
    all.push(...rows);
    if(rows.length<pageSize){exhausted=true;break;}
  }
  const decision=evaluateTaraEvidence({productId,expectedAmountXaf,paymentChannel,mobileStatus,
    transactionRows:all,webhookHint});
  // Une réponse corroborée sur une liste incomplète pourrait masquer un doublon sur une page non lue.
  if(!exhausted && decision.decision==='corroborated')
    return Object.freeze({decision:'manual_review',reason:'PAGINATION_INCOMPLETE',productId});
  return decision;
}
