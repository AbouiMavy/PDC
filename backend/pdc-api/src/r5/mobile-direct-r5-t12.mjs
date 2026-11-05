// T12-B — lanceur Mobile Money direct, exclusivement sur dossier diaspora R5 DEV.
// Réservation SQL stable avant toute émission, zéro relance après issue incertaine.
// Le rapprochement comptable et l'admission restent des opérations manuelles DISTINCTES.
import {randomBytes, createHash, createHmac} from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION=/^[A-Za-z0-9_-]{43}$/;
const PRODUCT=/^PDC_[A-Za-z0-9_-]{24}$/;
const AMOUNT=/^[1-9][0-9]{0,9}$/;
const HASH=/^[a-f0-9]{64}$/;
const fail=code=>{throw Error('PDC_T12_R5_'+code);};
function phone237(input){
  if(typeof input!=='string')fail('PHONE_INVALID');
  const simple=input.replace(/[\s().-]/g,'');
  const local=simple.startsWith('+237')?simple.slice(4):simple.startsWith('237')?simple.slice(3):simple;
  if(!/^6\d{8}$/.test(local))fail('PHONE_INVALID');
  return '237'+local;
}
export async function makeDiasporaMobileDirectR5T12({pool,mobileClient,webHookUrl,phoneHmacKey,
  enabled=false,environment='disabled',createProductId=()=>`PDC_${randomBytes(18).toString('base64url')}`}={}){
  if(enabled!==true||environment!=='sandbox'||typeof pool?.query!=='function'||
    typeof mobileClient?.initiate!=='function'||typeof webHookUrl!=='string'||
    !/^https:\/\//.test(webHookUrl)||typeof phoneHmacKey!=='string'||
    phoneHmacKey.length<32||typeof createProductId!=='function')fail('DISABLED');
  const identity=(await pool.query('SELECT current_user AS role_name')).rows?.[0]?.role_name;
  if(identity!=='pdc_r5_intake_writer')fail('ROLE_INVALID');
  return Object.freeze({
    async create({orderId,sessionToken,method,messagingChannel=null,mobileMode,mobilePhone,
      language='fr'}={}){
      if(!UUID.test(orderId??'')||!SESSION.test(sessionToken??'')||method!=='mobile'||
         mobileMode!=='direct'||messagingChannel!=null||!['fr','en'].includes(language))fail('INPUT_INVALID');
      // Ne pas envoyer de numéro de résidence par défaut : saisie EXPLICITE de débit.
      const providerPhone=phone237(mobilePhone);
      const sHash=createHash('sha256').update(sessionToken).digest('hex');
      const mac=createHmac('sha256',phoneHmacKey).update(providerPhone).digest('hex');
      const productId=createProductId();
      if(!PRODUCT.test(productId)||!HASH.test(mac))fail('PRODUCT_INVALID');
      // Valide dossier, consentements, photos, paiement, montant et idempotence.
      const rows=(await pool.query(`SELECT * FROM pdc_private.r5_reserve_tara_intent_dev(
        $1::uuid,$2::text,$3::text,$4::text,$5::text)`,
        [orderId,productId,sHash,'mobile',null])).rows;
      const r=rows?.[0];
      if(rows?.length!==1||!PRODUCT.test(r.product_id??'')||!UUID.test(r.payment_id??'')||
        !AMOUNT.test(String(r.amount_xaf??''))||
        !['reserved','requested','issued','unknown','cancelled'].includes(r.link_state))fail('RESERVATION_INVALID');
      const base={paymentId:r.payment_id,productId:r.product_id,grossAmountXaf:String(r.amount_xaf),
        currency:'XAF',paymentConfirmed:false,membershipGranted:false,cardIssued:false};
      // Si une émission antérieure existe (SMS ou direct), jamais de 2e appel Tara.
      if(r.link_state!=='reserved')return {...base,status:'manual_review'};
      const claimed=(await pool.query('SELECT pdc_private.r5_claim_mobile_direct_t12_dev($1::uuid,$2::text,$3::text,$4::text,$5::text) AS ok',
        [orderId,sHash,r.product_id,mac,providerPhone.slice(-4)])).rows?.[0]?.ok;
      if(claimed!==true)return {...base,status:'manual_review'};
      let stage='provider';
      try{
        const launched=await mobileClient.initiate({productId:r.product_id,
          productName:'Cotisation diaspora PDC',amountXaf:String(r.amount_xaf),
          phoneNumber:providerPhone,webHookUrl});
        if(!['request_initiated','request_rejected'].includes(launched?.status)||
          launched.paymentConfirmed!==false||launched.membershipGranted!==false||
          launched.productId!==r.product_id)fail('PROVIDER_RESULT_INVALID');
        stage='persistence';
        const saved=(await pool.query('SELECT pdc_private.r5_finish_mobile_direct_t12_dev($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text) AS ok',
          [orderId,sHash,r.product_id,launched.providerStatus,
            launched.providerMessage,launched.vendor])).rows?.[0]?.ok;
        if(saved!==true)fail('RESULT_NOT_STORED');
        return {...base,status:launched.status,providerStatus:launched.providerStatus,
          providerMessage:launched.providerMessage,vendor:launched.vendor};
      }catch(e){
        // L'appel a peut-être été reçu par Tara. Ne jamais relancer automatiquement.
        console.warn('PDC_T12_R5_MANUAL_REVIEW',JSON.stringify({stage}));
        try{await pool.query('SELECT pdc_private.r5_mark_mobile_direct_unknown_t12_dev($1::uuid,$2::text,$3::text)',
          [orderId,sHash,r.product_id]);}catch{/* intervention manuelle nécessaire */}
        return {...base,status:'manual_review'};
      }
    }
  });
}
