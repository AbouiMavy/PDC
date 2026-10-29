// Politique de comparaison avant clôture comptable. Entrées d'opérateur NON FIABLES.
const UUID_PRODUCT=/^PDC_[A-Za-z0-9_-]{24}$/;
const XAF=/^(?:0|[1-9][0-9]{0,9})$/;
export function decideManualTaraReviewV5C44({productId,expectedAmountXaf,
  observedAmountXaf,observedCurrency,observedStatus,referenceMatches}={}) {
  if (!UUID_PRODUCT.test(productId??'') || !XAF.test(expectedAmountXaf??'') ||
      BigInt(expectedAmountXaf)>2147483647n ||
      !XAF.test(observedAmountXaf??'') || BigInt(observedAmountXaf)>2147483647n ||
      !['XAF','EUR'].includes(observedCurrency) ||
      !['PAID','PENDING','FAILED','CANCELLED','UNKNOWN'].includes(observedStatus) ||
      typeof referenceMatches!=='boolean') throw Error('PDC_44_MANUAL_INPUT_INVALID');
  if(observedStatus!=='PAID')return Object.freeze({decision:'awaiting_payment',paymentConfirmed:false});
  if(!referenceMatches || expectedAmountXaf!==observedAmountXaf ||
     observedCurrency!=='XAF')return Object.freeze({decision:'disputed',paymentConfirmed:false});
  return Object.freeze({decision:'matched_for_operator_confirmation',paymentConfirmed:false});
}
