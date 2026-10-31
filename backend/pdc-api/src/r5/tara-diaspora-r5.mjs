// Émetteur R5 sandbox : partage le client Tara, les canaux et le registre d'intentions V5-C.
// Ne réutilise PAS les RPC R4 réservées au contrat public domestique.
import {randomBytes,createHash} from 'node:crypto';
import {selectTaraPaymentLink,validateStoredTaraChannelLink} from '../v5c/tara-channel-links-v5c.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION=/^[A-Za-z0-9_-]{43}$/;
const PRODUCT=/^PDC_[A-Za-z0-9_-]{24}$/;
const hash=x=>createHash('sha256').update(x).digest('hex');
const field=(method,channel)=>method==='mobile'?'smsLink':method==='carte'?'cardLink':
  method==='tara'?({general:'generalLink',whatsapp:'whatsappLink',telegram:'telegramLink',dikalo:'dikaloLink'}[channel]??null):null;
const fail=x=>{throw Error('PDC_R5_TARA_'+x);};
export async function makeDiasporaTaraR5({pool,taraClient,returnUrl,webHookUrl,enabled=false,environment='disabled'}={}){
  if(enabled!==true||environment!=='sandbox'||typeof pool?.query!=='function'||
     typeof taraClient?.createPaymentLink!=='function'||typeof returnUrl!=='string'||
     typeof webHookUrl!=='string'|| !returnUrl.startsWith('https://')||!webHookUrl.startsWith('https://')) fail('DISABLED');
  const role=(await pool.query('SELECT current_user AS role_name')).rows?.[0]?.role_name;
  if(role!=='pdc_r5_intake_writer')fail('ROLE_INVALID');
  return Object.freeze({
    async create({orderId,sessionToken,method,messagingChannel=null}){
      if(!UUID.test(orderId??'')||!SESSION.test(sessionToken??'')||!field(method,messagingChannel)||
        (method!=='tara'&&messagingChannel!=null))fail('INPUT_INVALID');
      const sHash=hash(sessionToken);
      const productId=`PDC_${randomBytes(18).toString('base64url')}`;
      const rows=(await pool.query(`SELECT * FROM pdc_private.r5_reserve_tara_intent_dev(
        $1::uuid,$2::text,$3::text,$4::text,$5::text)`,
        [orderId,productId,sHash,method,messagingChannel])).rows;
      const r=rows?.[0];
      if(rows?.length!==1||!PRODUCT.test(r.product_id??'')||!UUID.test(r.payment_id??'')||
        !/^[1-9][0-9]{0,9}$/.test(String(r.amount_xaf))||
        !['reserved','requested','issued','unknown','cancelled'].includes(r.link_state))fail('RESERVATION_INVALID');
      const base={paymentId:r.payment_id,grossAmountXaf:String(r.amount_xaf),
        currency:'XAF',paymentConfirmed:false,membershipGranted:false,cardIssued:false};
      if(r.link_state==='issued'){
        const rows=(await pool.query('SELECT * FROM pdc_private.r5_load_issued_tara_link_dev($1::uuid,$2::text)',
          [orderId,sHash])).rows;
        const old=rows?.[0];
        if(rows?.length!==1||old.product_id!==r.product_id||old.payment_id!==r.payment_id||
          old.link_field!==field(method,messagingChannel))return {...base,status:'manual_review'};
        try{
          const safe=validateStoredTaraChannelLink(old.payment_url,{method,messagingChannel});
          if(safe.field!==old.link_field)throw Error('link');
          return {...base,status:'issued',productId:r.product_id,linkField:old.link_field,paymentUrl:safe.paymentUrl};
        }catch{return {...base,status:'manual_review'};}
      }
      // Timeout fournisseur : état unknown/requested, jamais un second appel automatique.
      if(r.link_state!=='reserved')return {...base,status:'manual_review'};
      const claimed=(await pool.query('SELECT pdc_private.r5_claim_tara_link_dev($1::uuid,$2::text) AS ok',
        [orderId,sHash])).rows?.[0]?.ok;
      if(claimed!==true)return {...base,status:'manual_review'};
      let stage='provider';
      try{
        const payment=await taraClient.createPaymentLink({productId:r.product_id,
          productName:'Cotisation diaspora PDC',
          productDescription:'Cotisation diaspora PDC - paiement de demande non assimilable à une admission',
          amountXaf:String(r.amount_xaf),returnUrl,webHookUrl},
          {selectedField:field(method,messagingChannel)});
        stage='channel';
        const selected=selectTaraPaymentLink(payment,{method,messagingChannel});
        const safe=validateStoredTaraChannelLink(selected.paymentUrl,{method,messagingChannel});
        if(safe.field!==field(method,messagingChannel))fail('CHANNEL_INVALID');
        stage='persistence';
        const ok=(await pool.query(`SELECT pdc_private.r5_save_tara_link_dev(
          $1::uuid,$2::text,$3::text,$4::text,$5::text) AS ok`,
          [orderId,sHash,selected.field,safe.paymentUrl,payment.generalLink])).rows?.[0]?.ok;
        if(ok!==true)fail('PERSISTENCE_INVALID');
        return {...base,status:'issued',productId:r.product_id,linkField:selected.field,paymentUrl:safe.paymentUrl};
      }catch(e){
        // Si le prestataire a créé le paiement avant une erreur réseau, ne JAMAIS émettre à nouveau.
        console.warn('PDC_R5_TARA_MANUAL_REVIEW',JSON.stringify({stage,code:/^PDC_R5_[A-Z_]+$/.test(e?.message??'')?e.message:'UNEXPECTED'}));
        try{await pool.query('SELECT pdc_private.r5_mark_tara_unknown_dev($1::uuid,$2::text)',[orderId,sHash]);}catch{/* revue manuelle */}
        return {...base,status:'manual_review'};
      }
    }
  });
}
