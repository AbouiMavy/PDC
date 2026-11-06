// T12-D : verrou de démarrage Mobile Pay direct en environnement Codespaces V5-C.
// Ce module est purement serveur. Aucun secret n'est inclus dans les erreurs.
const deny=code=>{throw Error(`PDC_T12D_${code}`);};

export function decidePublicMobileActivationT12D(env={}){
  const flag=env.PDC_V5C41_MOBILE_DIRECT_ENABLED;
  if(flag===undefined||flag==='false')return Object.freeze({enabled:false});
  if(flag!=='true')deny('FLAG_INVALID');
  if(env.PDC_V5C41_MOBILE_DIRECT_REVIEW_APPROVED!=='true'||
     env.PDC_V5C41_MODE!=='sandbox'||
     env.PDC_V5C41_SANDBOX_KEY_CONFIRMED!=='true'||
     env.NODE_ENV==='production')deny('APPROVAL_MISSING');
  const secret=env.PDC_V5C41_MOBILE_HMAC_SECRET;
  if(typeof secret!=='string'||secret.length<32||secret.length>512||
     /[\r\n]/.test(secret))deny('HMAC_INVALID');
  return Object.freeze({enabled:true});
}

// Pré-vérification non destructive. Son échec doit empêcher le listener DEV
// de démarrer si le mode direct a été explicitement demandé.
export async function assertPublicMobileSqlReadyT12D(pool){
  if(typeof pool?.query!=='function')deny('DB_UNAVAILABLE');
  let result;
  try{
    result=await pool.query(`
      SELECT
        pg_catalog.to_regclass('pdc_private.t12_v5c_mobile_direct_dev') IS NOT NULL AS mobile_table,
        pg_catalog.to_regclass('pdc_private.t12_v5c_direct_evidence_dev') IS NOT NULL AS evidence_table,
        pg_catalog.to_regprocedure('pdc_private.t12_v5c_claim_mobile_direct_dev(text,uuid,uuid,text,text,text)') IS NOT NULL AS claim_rpc,
        pg_catalog.to_regprocedure('pdc_private.t12_v5c_finish_mobile_direct_dev(text,uuid,text,text,text)') IS NOT NULL AS finish_rpc,
        pg_catalog.to_regprocedure('pdc_private.t12_v5c_mark_mobile_unknown_dev(text,uuid)') IS NOT NULL AS unknown_rpc,
        EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
                WHERE t.tgrelid='pdc_private.tara_checkout_intents_v5c'::regclass
                  AND t.tgname='t12_v5c_direct_no_link_dev'
                  AND NOT t.tgisinternal AND t.tgenabled <> 'D') AS no_sms_after_direct
    `);
  }catch{deny('DB_PREFLIGHT_FAILED');}
  const row=result?.rows?.[0];
  if(result?.rows?.length!==1||!row||
     Object.values(row).some(v=>v!==true))deny('SQL_NOT_READY');
  return true;
}
