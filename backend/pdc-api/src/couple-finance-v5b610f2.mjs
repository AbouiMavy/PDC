// V5-B.6.10-F2 : préparation sans endpoint et sans accès direct SQL depuis React.
// Les 40 EUR représentent UNE commande de couple, et non deux cotisations 20 EUR.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const COUPLE_PRICE_MINOR=4000;
export const COUPLE_CURRENCY='EUR';
const reject=code=>{throw new Error(code);};
export function prepareCoupleFinanceDraft({payerPersonId,memberApplicationId,partnerApplicationId,quotedPriceMinor,quotedCurrency}={}){
  if (![payerPersonId,memberApplicationId,partnerApplicationId].every(v=>typeof v==='string'&&UUID.test(v)))
    reject('PDC_COUPLE_IDENTIFIERS_INVALID');
  if (memberApplicationId.toLowerCase()===partnerApplicationId.toLowerCase())
    reject('PDC_COUPLE_DISTINCT_APPLICATIONS_REQUIRED');
  // Le montant est toujours défini côté serveur. Toute valeur client contradictoire est rejetée.
  if (quotedPriceMinor!==undefined && quotedPriceMinor!==COUPLE_PRICE_MINOR)
    reject('PDC_COUPLE_CLIENT_PRICE_MISMATCH');
  if (quotedCurrency!==undefined && quotedCurrency!==COUPLE_CURRENCY)
    reject('PDC_COUPLE_CLIENT_CURRENCY_MISMATCH');
  return Object.freeze({
    payerPersonId:payerPersonId.toLowerCase(),
    beneficiaries:Object.freeze([
      Object.freeze({slot:'member',applicationId:memberApplicationId.toLowerCase()}),
      Object.freeze({slot:'partner',applicationId:partnerApplicationId.toLowerCase()}),
    ]),
    currency:COUPLE_CURRENCY,
    amountMinor:COUPLE_PRICE_MINOR,
    admission:'not-enabled',
    checkout:'not-enabled',
  });
}
// Usage interne ultérieur ; fonction SQL sans EXECUTE pour les rôles publics et API.
export function createCouplePaymentInspector({query}={}){
  if(typeof query!=='function')reject('PDC_COUPLE_SQL_ADAPTER_MISSING');
  return Object.freeze({
    async isVerified(orderId){
      if(typeof orderId!=='string'||!UUID.test(orderId))reject('PDC_COUPLE_ORDER_ID_INVALID');
      const r=await query('SELECT pdc_private.couple_payment_verified_dev_v5b610f2($1::uuid) AS verified',[orderId]);
      if(typeof r?.rows?.[0]?.verified!=='boolean')reject('PDC_COUPLE_VERIFICATION_UNAVAILABLE');
      return r.rows[0].verified;
    },
  });
}
