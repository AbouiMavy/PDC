// V5-C.29 : limiteur distribué, SQL atomique, sans stockage IP en clair.
// Fermé par défaut. Nécessite migration 029 et login PostgreSQL dédié.
import {createHmac} from 'node:crypto';
export async function makePgPublicRateLimiterV5C29({pool,hmacSecret,maxHits=5,
  enabled=false,environment='disabled'}={}){
  if(enabled!==true || environment!=='sandbox' ||
     typeof pool?.query!=='function' || typeof hmacSecret!=='string' ||
     hmacSecret.length<32 || !Number.isInteger(maxHits) || maxHits<1 || maxHits>20)
    throw new Error('PUBLIC_RATE_LIMIT_DISABLED');
  let role;
  try{role=(await pool.query('SELECT current_user AS role_name'))?.rows?.[0]?.role_name;}
  catch{throw new Error('PUBLIC_RATE_LIMIT_ROLE_UNKNOWN');}
  if(role!=='pdc_tara_v5c_writer')throw new Error('PUBLIC_RATE_LIMIT_ROLE_INVALID');
  return async function enforceRateLimit({address}={}){
    if(typeof address!=='string' || address.length<3 || address.length>128)return false;
    // HMAC avec secret distinct des autres clés, stable au sein des instances.
    const digest=createHmac('sha256',hmacSecret).update(address).digest('hex');
    try{
      const r=await pool.query(
        'SELECT pdc_private.tara_v5c29_limit_public_order($1::text,$2::integer) AS allowed',
        [digest,maxHits]);
      return r?.rows?.length===1 && r.rows[0]?.allowed===true;
    }catch{return false;}
  };
}
