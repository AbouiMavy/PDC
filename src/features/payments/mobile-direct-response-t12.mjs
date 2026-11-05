// La demande lancée n'est jamais une preuve d'encaissement.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT=/^PDC_[A-Za-z0-9_-]{24}$/;
export function validateMobileDirectResponseT12(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    !['request_initiated','request_rejected','manual_review'].includes(raw.status)||
    !UUID.test(raw.paymentId??'')||!PRODUCT.test(raw.productId??'')||
    !/^[1-9]\d{0,8}$/.test(raw.grossAmountXaf??'')||raw.currency!=='XAF'||
    raw.paymentConfirmed!==false||raw.membershipGranted!==false||
    raw.paymentUrl!=null||raw.linkField!=null||raw.transactionId!=null)throw Error('PDC_T12_INVALID_DIRECT_RESPONSE');
  if(raw.status!=='manual_review' &&
    (raw.providerStatus!==(raw.status==='request_initiated'?'SUCCESS':'FAILURE')||
     typeof raw.providerMessage!=='string'||!/^[A-Za-z0-9_ -]{1,80}$/.test(raw.providerMessage)||
     (raw.vendor!=null&&!/^[A-Z][A-Z0-9_]{1,63}$/.test(raw.vendor))))
    throw Error('PDC_T12_INVALID_DIRECT_RESPONSE');
  return Object.freeze({status:raw.status,paymentId:raw.paymentId,productId:raw.productId,
    grossAmountXaf:raw.grossAmountXaf,currency:'XAF',paymentConfirmed:false,membershipGranted:false,
    providerStatus:raw.providerStatus??null,vendor:raw.vendor??null});
}
