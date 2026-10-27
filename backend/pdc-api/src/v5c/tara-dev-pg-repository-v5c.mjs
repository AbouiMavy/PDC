// V5-C — depot Postgres DEV, non branche au backend readonly.
// Le role pdc_tara_v5c_writer n'est PAS cree/grante par la migration ;
// son provisionnement fera l'objet d'un audit et d'une autorisation distincts.
import { V5CError } from './contracts.mjs';
const fail=code=>{throw new V5CError(code);};
const ROLE='pdc_tara_v5c_writer';

export async function makeTaraDevPgRepository({pool,enabled=false,
  environment='disabled',expectedRole=ROLE}={}) {
  if(enabled!==true || environment!=='sandbox' || expectedRole!==ROLE ||
     !pool || typeof pool.query!=='function' || typeof pool.connect!=='function')
    fail('PDC_TARA_PG_DISABLED');
  // Si le pool dispose de droits postgres ou service_role, RIEN ne passe.
  let result;
  try {result=await pool.query('SELECT current_user AS role_name');}
  catch {fail('PDC_TARA_PG_ROLE_UNKNOWN');}
  if (result?.rows?.[0]?.role_name!==ROLE) fail('PDC_TARA_PG_WRONG_ROLE');

  async function reserveCheckout(input) {
    let connection;
    try {
      connection=await pool.connect();
      await connection.query('BEGIN');
      await connection.query(`
        INSERT INTO pdc_private.tara_checkout_intents_v5c
          (product_id,payment_id,quote_id,payer_id,idempotency_key,amount_xaf,currency)
        VALUES ($1,$2::uuid,$3::uuid,$4::uuid,$5,$6::bigint,'XAF')
        ON CONFLICT (idempotency_key) DO NOTHING`,
        [input.productId,input.paymentId,input.quoteId,input.payerId,
         input.idempotencyKey,input.amountXaf]);
      const result=await connection.query(`
        SELECT product_id AS "productId", payment_id::text AS "paymentId",
          quote_id::text AS "quoteId",payer_id::text AS "payerId",
          idempotency_key AS "idempotencyKey",amount_xaf::text AS "amountXaf",
          currency,link_state AS "linkState",general_link AS "generalLink"
        FROM pdc_private.tara_checkout_intents_v5c
        WHERE idempotency_key=$1 FOR UPDATE`,[input.idempotencyKey]);
      if(result.rows?.length!==1) fail('PDC_TARA_DB_RESERVE_INVALID');
      await connection.query('COMMIT');
      return result.rows[0];
    } catch {
      if(connection) try {await connection.query('ROLLBACK');} catch { /* fail closed */ }
      fail('PDC_TARA_DB_RESERVE_FAILED');
    } finally { if(connection) connection.release(); }
  }
  async function claimLinkRequest(productId) {
    const r=await pool.query(`
      UPDATE pdc_private.tara_checkout_intents_v5c
        SET link_state='requested',requested_at=pg_catalog.now()
      WHERE product_id=$1 AND link_state='reserved'
      RETURNING product_id`,[productId]);
    return r.rowCount===1;
  }
  async function saveIssuedLink(productId,generalLink) {
    const r=await pool.query(`
      UPDATE pdc_private.tara_checkout_intents_v5c
        SET link_state='issued',general_link=$2
      WHERE product_id=$1 AND link_state='requested'
      RETURNING product_id`,[productId,generalLink]);
    if(r.rowCount!==1) fail('PDC_TARA_DB_LINK_STATE_CHANGED');
  }
  async function markLinkUnknown(productId) {
    const r=await pool.query(`
      UPDATE pdc_private.tara_checkout_intents_v5c SET link_state='unknown'
      WHERE product_id=$1 AND link_state='requested' RETURNING product_id`,[productId]);
    return r.rowCount===1;
  }
  async function insertUntrustedWebhookOnce(hint) {
    if(hint?.trusted!==false || hint.verification!=='required')
      fail('PDC_TARA_WEBHOOK_NOT_UNTRUSTED');
    const r=await pool.query(`
      INSERT INTO pdc_private.tara_webhook_inbox_v5c
        (fingerprint,product_id,provider_payment_id,amount_claimed_xaf,status_claimed,untrusted)
      VALUES ($1,$2,$3,$4::bigint,$5,true)
      ON CONFLICT (fingerprint) DO NOTHING`,
      [hint.eventId,hint.productId,hint.paymentId,hint.amount,hint.status]);
    return r.rowCount===1;
  }
  async function loadCheckout(productId) {
    const r=await pool.query(`
      SELECT product_id AS "productId", amount_xaf::text AS "amountXaf",
             currency,link_state AS "linkState"
      FROM pdc_private.tara_checkout_intents_v5c WHERE product_id=$1`,[productId]);
    return r.rows?.[0]??null;
  }
  async function recordEvidence(input) {
    if (!['corroborated','not_verified','manual_review'].includes(input?.decision))
      fail('PDC_TARA_EVIDENCE_INVALID');
    const r=await pool.query(`
      INSERT INTO pdc_private.tara_reconciliation_evidence_v5c
       (product_id,decision,reason,expected_amount_xaf,payment_channel)
      VALUES ($1,$2,$3,$4::bigint,$5)`,
      [input.productId,input.decision,input.reason,input.expectedAmountXaf,input.paymentChannel]);
    if(r.rowCount!==1) fail('PDC_TARA_EVIDENCE_NOT_STORED');
  }
  return Object.freeze({reserveCheckout,claimLinkRequest,saveIssuedLink,
    markLinkUnknown,insertUntrustedWebhookOnce,loadCheckout,recordEvidence});
}
