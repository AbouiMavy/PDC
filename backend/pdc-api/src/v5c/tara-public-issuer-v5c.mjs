// V5-C.27 — émission unique, persistée et contrôlée par canal ; DEV seulement.
// Aucune émission automatique après une erreur incertaine.
import { V5CError, preparePrivateCheckout } from './contracts.mjs';
import { selectTaraPaymentLink, validateStoredTaraChannelLink } from './tara-channel-links-v5c.mjs';

const fail = code => { throw new V5CError(code); };
const expectedChannel = (method, messagingChannel) =>
  method === 'mobile' && messagingChannel == null ? 'smsLink' :
  method === 'carte' && messagingChannel == null ? 'cardLink' :
  method === 'tara' && messagingChannel === 'general' ? 'generalLink' :
  method === 'tara' && messagingChannel === 'whatsapp' ? 'whatsappLink' :
  method === 'tara' && messagingChannel === 'telegram' ? 'telegramLink' :
  method === 'tara' && messagingChannel === 'dikalo' ? 'dikaloLink' : null;

export function makeTaraPublicIssuerV5C({taraReservations,channelStore,taraClient,
  returnUrl,webHookUrl,enabled=false,environment='disabled'}={}) {
  if (enabled !== true || environment !== 'sandbox') fail('PDC_TARA_PUBLIC_ISSUER_DISABLED');
  if (typeof taraReservations?.claimLinkRequest !== 'function' ||
      typeof taraReservations?.markLinkUnknown !== 'function' ||
      typeof channelStore?.saveIssuedChannel !== 'function' ||
      typeof channelStore?.loadIssuedChannel !== 'function' ||
      typeof taraClient?.createPaymentLink !== 'function' ||
      typeof returnUrl !== 'string' || typeof webHookUrl !== 'string')
    fail('PDC_TARA_PUBLIC_ISSUER_DEPENDENCY_INVALID');

  async function issue({order,row,idempotencyKey}={}) {
    const field=expectedChannel(order?.method,order?.messagingChannel);
    if (!field || !row || row.paymentId !== order.paymentId ||
        row.quoteId !== order.quote?.quoteId || row.payerId !== order.quote?.payerId ||
        row.idempotencyKey !== idempotencyKey || row.amountXaf !== order.grossAmountXaf ||
        row.currency !== 'XAF') fail('PDC_TARA_PUBLIC_ISSUER_ORDER_INVALID');
    // Vérification de l'authenticité du devis privé, y compris sur un retry.
    preparePrivateCheckout({quote:order.quote,paymentId:order.paymentId,
      provider:'tara',idempotencyKey});
    if (row.linkState === 'issued') {
      const saved=await channelStore.loadIssuedChannel({productId:row.productId,idempotencyKey});
      // Une émission ancienne uniquement généraliste ou un canal discordant
      // nécessite une intervention humaine : jamais un second appel fournisseur.
      if (!saved || saved.productId!==row.productId || saved.paymentId!==row.paymentId ||
          saved.method!==order.method || (saved.messagingChannel??null)!==(order.messagingChannel??null) ||
          saved.linkField!==field) return Object.freeze({status:'manual_review'});
      let validated;
      try { validated=validateStoredTaraChannelLink(saved.paymentUrl,{method:order.method,
        messagingChannel:order.messagingChannel}); }
      catch {return Object.freeze({status:'manual_review'});}
      return Object.freeze({status:'issued',paymentUrl:validated.paymentUrl,
        linkField:field,productId:row.productId});
    }
    if (row.linkState !== 'reserved') return Object.freeze({status:'manual_review'});
    if (await taraReservations.claimLinkRequest(row.productId)!==true)
      return Object.freeze({status:'manual_review'});

    // À partir de ce point, tout échec (y compris lien de canal manquant)
    // est potentiellement postérieur à une création réelle chez Tara.
    // Il interdit une nouvelle émission automatique.
    let stage='build';
    try {
      // Le client Tara transforme amountXaf en productPrice
      // UNE SEULE FOIS avant l'appel réseau.
      const input={
        productId:row.productId,
        productName:order.quote.kind==='donation'?'Don au PDC':'Première adhésion PDC',
        productDescription:'Contribution PDC - paiement de commande publique',
        amountXaf:order.quote.amountMinor,returnUrl,webHookUrl,
      };
      stage='provider';
      const links=await taraClient.createPaymentLink(
        input,{selectedField:field});
      stage='selection';
      const selected=selectTaraPaymentLink(links,{method:order.method,
        messagingChannel:order.messagingChannel});
      // Une seule transaction SQL associe generalLink (historique),
      // canal demandé, champ et URL sélectionnée à la même commande.
      stage='persistence';
      await channelStore.saveIssuedChannel({productId:row.productId,
        paymentId:order.paymentId,idempotencyKey,method:order.method,
        messagingChannel:order.messagingChannel,linkField:selected.field,
        paymentUrl:selected.paymentUrl,generalLink:links.generalLink});
      return Object.freeze({status:'issued',paymentUrl:selected.paymentUrl,
        linkField:selected.field,productId:row.productId});
    } catch(error) {
      console.warn('PDC_V5C41_ISSUE_REVIEW',
        JSON.stringify({
          stage,
          code:error instanceof V5CError
            ? error.code
            : 'UNEXPECTED'
        }));
      try {await taraReservations.markLinkUnknown(row.productId);} catch { /* revue humaine */ }
      return Object.freeze({status:'manual_review'});
    }
  }
  return Object.freeze({issue});
}
