// V5-C.44.4 : simple accusé de réception, JAMAIS une preuve d'encaissement.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT=/^PDC_[A-Za-z0-9_-]{24}$/;
const STATES=new Set(['issued','manual_review','pending_external_payment',
  'pending_payment_setup','reserved_channel_pending']);
export function makePendingReceiptV5C44(source, result) {
  if (!['membership','donation'].includes(source) || !result ||
      !UUID.test(result.paymentId??'') || !STATES.has(result.status) ||
      !/^[1-9][0-9]{0,8}$/.test(result.grossAmountXaf??'') ||
      result.currency!=='XAF' || result.paymentConfirmed!==false ||
      result.membershipGranted!==false ||
      (result.productId!=null && (!PRODUCT.test(result.productId) || result.status!=='issued')))
    throw Error('PDC_44_RECEIPT_INVALID');
  return Object.freeze({source,paymentId:result.paymentId,productId:result.productId??null,
    amountXaf:result.grossAmountXaf,currency:'XAF',
    orderStatus:result.status,stage:'awaiting_manual_verification',
    paymentConfirmed:false,membershipGranted:false});
}
// La navigation React peut être falsifiée. Elle ne porte AUCUNE valeur probante.
export function readPendingReceiptV5C44(value, source) {
  if (!value || typeof value!=='object' || !value.pdcReceipt ||
      value.pdcReceipt.source!==source) return null;
  const r=value.pdcReceipt;
  try {
    if (r.stage!=='awaiting_manual_verification' ||
        r.paymentConfirmed!==false || r.membershipGranted!==false) return null;
    return makePendingReceiptV5C44(source,{
      paymentId:r.paymentId,productId:r.productId??null,grossAmountXaf:r.amountXaf,currency:r.currency,
      status:r.orderStatus,paymentConfirmed:false,membershipGranted:false});
  } catch {return null;}
}
