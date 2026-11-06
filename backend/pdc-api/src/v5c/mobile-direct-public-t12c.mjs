// PDC T12-C : Mobile Money direct pour don / adhésion Cameroun, DEV isolé.
// AUCUNE relance après erreur/timeout. SUCCESS fournisseur != paiement confirmé.
import {createHmac} from 'node:crypto';

const PRODUCT=/^PDC_[A-Za-z0-9_-]{24}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9:_-]{16,128}$/;
const VALUE=/^[1-9][0-9]{0,8}$/;
const fail=code=>{throw Error(`PDC_T12C_${code}`);};

export function normalizeCameroonDebitT12C(value){
  if(typeof value!=='string')fail('PHONE_INVALID');
  const stripped=value.replace(/[\s().-]/g,'');
  const digits=stripped.startsWith('+237')?stripped.slice(4):
    stripped.startsWith('237')?stripped.slice(3):stripped;
  if(!/^6\d{8}$/.test(digits))fail('PHONE_INVALID');
  return `237${digits}`;
}

export async function makePublicMobileDirectT12C({pool,mobileClient,webHookUrl,phoneHmacKey,
  enabled=false,environment='disabled'}={}){
  if(enabled!==true||environment!=='sandbox'||typeof pool?.query!=='function'||
     typeof mobileClient?.initiate!=='function'||typeof webHookUrl!=='string'||
     !/^https:\/\/[^\s]+$/.test(webHookUrl)||typeof phoneHmacKey!=='string'||
     phoneHmacKey.length<32)fail('DISABLED');
  const role=(await pool.query('SELECT current_user AS role_name')).rows?.[0]?.role_name;
  if(role!=='pdc_tara_v5c_writer')fail('ROLE_INVALID');
  return Object.freeze({
    async initiate({order,row,idempotencyKey}={}){
      if(!order||!row||order.method!=='mobile'||order.mobileMode!=='direct'||
        order.messagingChannel!=null||!PRODUCT.test(row.productId??'')||
        !UUID.test(row.paymentId??'')||!UUID.test(row.quoteId??'')||
        !UUID.test(order.quote?.quoteId??'')||!UUID.test(order.paymentId??'')||
        !ID.test(idempotencyKey??'')||row.idempotencyKey!==idempotencyKey||
        order.paymentId!==row.paymentId||order.quote.quoteId!==row.quoteId||
        order.quote.payerId!==row.payerId||row.amountXaf!==order.quote.amountMinor||
        !VALUE.test(String(row.amountXaf??''))||row.currency!=='XAF')fail('ORDER_INVALID');
      const phone=normalizeCameroonDebitT12C(order.mobilePhone);
      const digest=createHmac('sha256',phoneHmacKey).update(phone).digest('hex');
      const base=Object.freeze({paymentId:row.paymentId,productId:row.productId,
        grossAmountXaf:row.amountXaf,currency:'XAF',paymentConfirmed:false,membershipGranted:false});
      // Une émission SMS précédente ou un direct déjà tenté ne peut pas être réémis.
      if(row.linkState!=='reserved')return Object.freeze({...base,status:'manual_review'});
      const claimed=(await pool.query(
        'SELECT pdc_private.t12_v5c_claim_mobile_direct_dev($1::text,$2::uuid,$3::uuid,$4::text,$5::text,$6::text) AS ok',
        [row.productId,row.paymentId,row.quoteId,idempotencyKey,digest,phone.slice(-4)])).rows?.[0]?.ok;
      if(claimed!==true)return Object.freeze({...base,status:'manual_review'});
      let stage='provider';
      try {
        const launched=await mobileClient.initiate({
          productId:row.productId,
          productName:order.quote.kind==='donation'?'Don au PDC':'Première adhésion PDC',
          amountXaf:row.amountXaf,phoneNumber:phone,webHookUrl,
        });
        if(!launched||launched.productId!==row.productId||
           !['request_initiated','request_rejected'].includes(launched.status)||
           launched.providerStatus!==(launched.status==='request_initiated'?'SUCCESS':'FAILURE')||
           launched.paymentConfirmed!==false||launched.membershipGranted!==false||
           typeof launched.providerMessage!=='string'||
           !/^[A-Za-z0-9_ -]{1,80}$/.test(launched.providerMessage)||
           (launched.vendor!=null && !/^[A-Z][A-Z0-9_]{1,63}$/.test(launched.vendor)))
          fail('PROVIDER_RESULT_INVALID');
        stage='persistence';
        const saved=(await pool.query(
          'SELECT pdc_private.t12_v5c_finish_mobile_direct_dev($1::text,$2::uuid,$3::text,$4::text,$5::text) AS ok',
          [row.productId,row.paymentId,launched.providerStatus,
            launched.providerMessage,launched.vendor??null])).rows?.[0]?.ok;
        if(saved!==true)fail('PERSISTENCE_INVALID');
        return Object.freeze({...base,status:launched.status,providerStatus:launched.providerStatus,
          providerMessage:launched.providerMessage,vendor:launched.vendor??null});
      } catch {
        // Un timeout est une issue inconnue. Ne jamais émettre un deuxième débit.
        console.warn('PDC_T12C_MANUAL_REVIEW',JSON.stringify({stage}));
        try {await pool.query(
          'SELECT pdc_private.t12_v5c_mark_mobile_unknown_dev($1::text,$2::uuid)',
          [row.productId,row.paymentId]);}catch{/* Revue manuelle obligatoire */}
        return Object.freeze({...base,status:'manual_review'});
      }
    }
  });
}
