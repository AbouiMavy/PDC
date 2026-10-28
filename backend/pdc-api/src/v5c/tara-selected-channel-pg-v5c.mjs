// V5-C.27 — uniquement les RPC SQL privées de canal, sans DML direct.
import {V5CError} from './contracts.mjs';
const fail = code => {throw new V5CError(code);};
const ROLE='pdc_tara_v5c_writer';
export async function makeTaraSelectedChannelPgV5C({pool,enabled=false,environment='disabled'}={}) {
  if (enabled!==true || environment!=='sandbox' || typeof pool?.query!=='function')
    fail('PDC_TARA_CHANNEL_PG_DISABLED');
  let role;
  try {role=(await pool.query('SELECT current_user AS role_name'))?.rows?.[0]?.role_name;}
  catch {fail('PDC_TARA_CHANNEL_PG_ROLE_UNKNOWN');}
  if (role!==ROLE) fail('PDC_TARA_CHANNEL_PG_ROLE_INVALID');
  async function query(sql,params) {
    try {return await pool.query(sql,params);} catch {fail('PDC_TARA_CHANNEL_PG_FAILED');}
  }
  async function saveIssuedChannel(x) {
    const r=await query(`SELECT pdc_private.tara_v5c_save_issued_channel(
      $1::text,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text) AS ok`,
      [x.productId,x.paymentId,x.idempotencyKey,x.method,x.messagingChannel??null,
        x.linkField,x.paymentUrl,x.generalLink]);
    if(r?.rows?.length!==1 || r.rows[0]?.ok!==true) fail('PDC_TARA_CHANNEL_PG_SAVE_FAILED');
  }
  async function loadIssuedChannel({productId,idempotencyKey}) {
    const r=await query(`SELECT * FROM pdc_private.tara_v5c_load_issued_channel(
      $1::text,$2::text)`,[productId,idempotencyKey]);
    if (!Array.isArray(r?.rows) || r.rows.length>1) fail('PDC_TARA_CHANNEL_PG_LOAD_INVALID');
    return r.rows[0]??null;
  }
  return Object.freeze({saveIssuedChannel,loadIssuedChannel});
}
