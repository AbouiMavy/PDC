// V5-C.23 — persistance atomique d'une commande publique sans session militant.
// Le service HTTP futur doit valider le CAPTCHA et appliquer un rate-limit.
// Pas de SELECT/INSERT/UPDATE direct : une seule fonction SQL privee, propriétaire.
import { V5CError, quoteFromPrivateDb } from './contracts.mjs';
import { preparePublicOrderRequest } from './tara-public-order-preparation-v5c.mjs';

const fail = code => {throw new V5CError(code);};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE='pdc_tara_v5c_writer';

export async function makePublicOrderPgV5C({pool,enabled=false,environment='disabled'}={}) {
  if (enabled!==true || environment!=='sandbox' || typeof pool?.query!=='function')
    fail('PDC_PUBLIC_ORDER_DB_DISABLED');
  let role;
  try {role=(await pool.query('SELECT current_user AS role_name')).rows?.[0]?.role_name;}
  catch {fail('PDC_PUBLIC_ORDER_DB_ROLE_UNKNOWN');}
  if(role!==ROLE) fail('PDC_PUBLIC_ORDER_DB_ROLE_INVALID');
  return Object.freeze({
    /** raw est issu du navigateur, mais aucun montant d'adhésion n'est accepté. */
    async create(raw) {
      const p=preparePublicOrderRequest(raw);
      const payload={kind:p.kind,idempotencyKey:p.idempotencyKey,
        requestDigest:p.requestDigest,firstName:p.firstName,lastName:p.lastName,
        email:p.email,phoneE164:p.phoneE164,country:p.country,
        method:p.method,messagingChannel:p.messagingChannel,
        grossAmountXaf:p.grossAmountXaf,
        membership:p.membership,designations:p.designations};
      let rows;
      try {
        const result=await pool.query(
          'SELECT * FROM pdc_private.tara_v5c_create_public_order($1::jsonb)',
          [JSON.stringify(payload)]);
        rows=result.rows;
      } catch {fail('PDC_PUBLIC_ORDER_DB_FAILED');}
      if(!Array.isArray(rows) || rows.length!==1) fail('PDC_PUBLIC_ORDER_DB_RESPONSE_INVALID');
      const row=rows[0];
      if(!row || !UUID.test(row.paymentId) || !UUID.test(row.quoteId) || !UUID.test(row.payerId) ||
         row.kind!==p.kind || row.amountMinor!==p.grossAmountXaf || row.currency!=='XAF' ||
         !Array.isArray(row.beneficiaryIds) ||
         row.beneficiaryIds.length!==(p.kind==='individual_initial'?1:0) ||
         (p.kind==='individual_initial' && row.beneficiaryIds[0]!==row.payerId))
        fail('PDC_PUBLIC_ORDER_DB_RESPONSE_INVALID');
      const quote=quoteFromPrivateDb({quote_id:row.quoteId,payer_id:row.payerId,
        kind:row.kind,amount_minor:row.amountMinor,currency:row.currency,
        beneficiary_ids:row.beneficiaryIds});
      return Object.freeze({paymentId:row.paymentId,quote,
        method:p.method,messagingChannel:p.messagingChannel,
        grossAmountXaf:p.grossAmountXaf,currency:'XAF',
        paymentConfirmed:false,membershipGranted:false});
    }
  });
}
