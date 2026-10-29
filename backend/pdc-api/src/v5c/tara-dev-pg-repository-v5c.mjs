// V5-C lot IV — dépôt PostgreSQL limité à 7 passerelles RPC SECURITY DEFINER.
// Jamais de DML direct sur les tables privées : le compte writer n'y a aucun droit.
import { V5CError } from './contracts.mjs';
const fail=code=>{throw new V5CError(code);};
const ROLE='pdc_tara_v5c_writer';
const validBool=r=> r?.rows?.length===1 && typeof r.rows[0]?.ok==='boolean';

export async function makeTaraDevPgRepository({pool,enabled=false,
  environment='disabled',expectedRole=ROLE}={}) {
  if(enabled!==true || environment!=='sandbox' || expectedRole!==ROLE ||
     !pool || typeof pool.query!=='function') fail('PDC_TARA_PG_DISABLED');
  let role;
  try {role=await pool.query('SELECT current_user AS role_name');}
  catch {fail('PDC_TARA_PG_ROLE_UNKNOWN');}
  if(role?.rows?.[0]?.role_name!==ROLE) fail('PDC_TARA_PG_WRONG_ROLE');
  // L'identité de connexion est vérifiée au démarrage. Aucun secret n'est journalisé.
  async function query(sql,params){
    try {return await pool.query(sql,params);} catch {fail('PDC_TARA_DB_OPERATION_FAILED');}
  }
  async function rpcBool(sql,params){
    const r=await query(sql,params);
    if(!validBool(r)) fail('PDC_TARA_DB_RESPONSE_INVALID');
    return r.rows[0].ok;
  }
  async function reserveCheckout(input){
    if (!input || typeof input!=='object') fail('PDC_TARA_DB_RESERVE_INVALID');
    const r=await query(`SELECT * FROM pdc_private.tara_v5c_reserve_intent(
      $1::text,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint)`,
      [input.productId,input.paymentId,input.quoteId,input.payerId,
       input.idempotencyKey,input.amountXaf]);
    if(r?.rows?.length!==1 || !r.rows[0]) fail('PDC_TARA_DB_RESERVE_INVALID');
    return r.rows[0];
  }
  async function claimLinkRequest(productId){
    return rpcBool('SELECT pdc_private.tara_v5c_claim_link($1::text) AS ok',[productId]);
  }
  async function saveIssuedLink(productId,generalLink){
    if(await rpcBool('SELECT pdc_private.tara_v5c_save_issued_link($1::text,$2::text) AS ok',
      [productId,generalLink])!==true) fail('PDC_TARA_DB_LINK_STATE_CHANGED');
  }
  async function markLinkUnknown(productId){
    return rpcBool('SELECT pdc_private.tara_v5c_mark_unknown($1::text) AS ok',[productId]);
  }
  async function insertUntrustedWebhookOnce(hint){
    if(hint?.trusted!==false || hint.verification!=='required')
      fail('PDC_TARA_WEBHOOK_NOT_UNTRUSTED');
    return rpcBool(`SELECT pdc_private.tara_v5c_record_hint(
      $1::text,$2::text,$3::text,$4::bigint,$5::text) AS ok`,
      [hint.eventId,hint.productId,hint.paymentId,hint.amount,hint.status]);
  }
  async function loadCheckout(productId){
    const r=await query('SELECT * FROM pdc_private.tara_v5c_load_checkout($1::text)',[productId]);
    if(!Array.isArray(r?.rows)||r.rows.length>1)fail('PDC_TARA_DB_RESPONSE_INVALID');
    return r.rows[0]??null;
  }
  async function recordEvidence(input){
    if (!['corroborated','not_verified','manual_review'].includes(input?.decision))
      fail('PDC_TARA_EVIDENCE_INVALID');
    if(await rpcBool(`SELECT pdc_private.tara_v5c_record_evidence(
      $1::text,$2::text,$3::text,$4::bigint,$5::text) AS ok`,
      [input.productId,input.decision,input.reason,input.expectedAmountXaf,
       input.paymentChannel])!==true)fail('PDC_TARA_EVIDENCE_NOT_STORED');
  }
  return Object.freeze({reserveCheckout,claimLinkRequest,saveIssuedLink,
    markLinkUnknown,insertUntrustedWebhookOnce,loadCheckout,recordEvidence});
}
