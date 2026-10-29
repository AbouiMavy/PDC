// V5-C — préparation de lien avec un devis privé vérifié, sans effet externe.
// Obligatoire : persister productId et commande en DB avant d'activer createPaymentLink.
import { preparePrivateCheckout, V5CError } from './contracts.mjs';
import { makeTaraLinkInput, validateTaraProductId } from './tara-server-client-v5c.mjs';

const TITLES=Object.freeze({
  individual_initial:'Adhesion PDC',
  couple_initial:'Adhesion couple PDC',
  renewal:'Cotisation PDC',
  donation:'Don PDC',
});
export function prepareTaraCheckoutDraft({quote,paymentId,idempotencyKey,productId,returnUrl,webHookUrl}={}) {
  const checkout=preparePrivateCheckout({quote,paymentId,provider:'tara',idempotencyKey});
  validateTaraProductId(productId);
  if(checkout.currency!=='XAF') throw new V5CError('PDC_TARA_EUR_NOT_DOCUMENTED');
  return Object.freeze({
    checkout,productId,
    taraInput:makeTaraLinkInput({productId,productName:TITLES[quote.kind],
      amountXaf:checkout.amountMinor,productDescription:'Operation PDC - reference anonyme',
      returnUrl,webHookUrl}),
    // Un brouillon ne permet ni envoi réseau ni admission automatique.
    persisted:false,paymentConfirmed:false,
  });
}
