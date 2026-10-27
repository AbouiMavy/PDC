// V5-C — parité EUR / XAF fixe ; devis issu exclusivement de la base privée.
// Aucun cours réseau et aucun flottant JS. Tarif juridique EUR conservé intact.
// Envoi Tara seulement après approbation du grand livre multi-devises.
import { preparePrivateCheckout, V5CError } from './contracts.mjs';

export const EUR_XAF_FIXED = Object.freeze({ numerator: '655957', denominator: '1000',
  rate: '1 EUR = 655.957 XAF', rounding: 'nearest_10_XAF_half_up' });
const INTEGER = /^[1-9][0-9]{0,18}$/;
const MAX_PROVIDER_AMOUNT = 2147483647n;
const invalid = () => { throw new V5CError('PDC_TARA_FX_AMOUNT_INVALID'); };

/** Centimes d'EUR -> XAF entiers, arrondi DIRECT à la dizaine la plus proche.
 * valeur exacte XAF = centimes * 655957 / 100000 ;
 * arrondi au multiple de 10 = floor((valeur exacte + 5) / 10) * 10.
 */
export function eurCentsToXafTens(amountCents) {
  if (typeof amountCents !== 'string' || !INTEGER.test(amountCents)) invalid();
  const cents = BigInt(amountCents);
  if (cents > 9223372036854775807n) invalid();
  const xaf = ((cents * 655957n + 500000n) / 1000000n) * 10n;
  if (xaf <= 0n || xaf > MAX_PROVIDER_AMOUNT) invalid();
  return xaf.toString();
}

/** Préparation seule : NE convertit PAS un paiement EUR existant en paiement XAF.
 * Interdit la fabrication d'un devis depuis un objet navigateur non brandé.
 */
export function preparePrivateTaraXafPrice({quote,paymentId,idempotencyKey}={}) {
  const checkout = preparePrivateCheckout({quote,paymentId,idempotencyKey,provider:'tara'});
  const providerAmountXaf = checkout.currency === 'EUR'
    ? eurCentsToXafTens(checkout.amountMinor)
    : checkout.amountMinor;
  if (!INTEGER.test(providerAmountXaf) || BigInt(providerAmountXaf)>MAX_PROVIDER_AMOUNT) invalid();
  return Object.freeze({
    quoteId:checkout.quoteId,payerId:quote.payerId,kind:quote.kind,
    paymentId:checkout.paymentId,idempotencyKey:checkout.idempotencyKey,
    originalAmountMinor:checkout.amountMinor,originalCurrency:checkout.currency,
    taraPriceXaf:providerAmountXaf,
    conversion:checkout.currency==='EUR'?EUR_XAF_FIXED:null,
    // Le paiement original EUR ne doit pas être écrit comme un reçu XAF.
    requiresCrossCurrencyLedgerApproval:checkout.currency==='EUR',
    paymentConfirmed:false,
  });
}
