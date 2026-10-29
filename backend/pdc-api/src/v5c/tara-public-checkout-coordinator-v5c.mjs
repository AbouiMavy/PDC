// V5-C.25 — compose commande publique et réservation Tara, SANS émettre de lien.
// La page multi-moyens generalLink n'est jamais renvoyée à un canal sélectionné.
// Le lot DEV ne crée aucune route, n'appelle aucun prestataire et ne confirme rien.
import { randomBytes } from 'node:crypto';
import { preparePrivateCheckout, V5CError } from './contracts.mjs';
import { validateStoredTaraChannelLink, TARA_LINK_FIELDS } from './tara-channel-links-v5c.mjs';
// V5C27: public channel issuance is explicitly opt-in.

const fail = code => { throw new V5CError(code); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT = /^PDC_[A-Za-z0-9_-]{24}$/;
const METHODS = new Set(['mobile','tara','carte','virement']);
const PENDING = 'reserved_channel_pending';
const EXTERNAL = 'pending_external_payment';

/**
 * Deux écritures sont séparées :
 *  1. create() => dossier, paiement BRUT, allocation (transaction SQL 023) ;
 *  2. reserveCheckout() => référence Tara stable (RPC SQL 021).
 * En cas d'échec entre les deux, la reprise avec la même clé est idempotente.
 * La création d'un lien fournisseur n'appartient PAS à ce service : le futur
 * routeur devra vérifier les URLs propres à chaque canal avant de l'activer.
 */
export function makePublicCheckoutCoordinatorV5C({orders,taraReservations,
  createProductId=()=>`PDC_${randomBytes(18).toString('base64url')}`,
  taraIssuer=null,issueLinks=false,enabled=false,environment='disabled'}={}) {
  if (enabled!==true || environment!=='sandbox') fail('PDC_PUBLIC_COORDINATOR_DISABLED');
  if (typeof orders?.create!=='function' || typeof taraReservations?.reserveCheckout!=='function' ||
      typeof createProductId!=='function' ||
      (issueLinks!==false && (issueLinks!==true || typeof taraIssuer?.issue!=='function')))
    fail('PDC_PUBLIC_COORDINATOR_DEPENDENCY_INVALID');

  async function create(raw) {
    // La validation exhaustive des données publiques, des tarifs et du digest
    // s'effectue dans orders.create(), avant sa RPC SQL transactionnelle.
    const order=await orders.create(raw);
    if (!order || !UUID.test(order.paymentId) ||
        !METHODS.has(order.method) || order.method!==raw?.method ||
        !['XAF'].includes(order.currency) ||
        typeof order.grossAmountXaf!=='string' || !/^[1-9][0-9]{0,8}$/.test(order.grossAmountXaf) ||
        !order.quote || order.quote.currency!=='XAF' ||
        order.quote.amountMinor!==order.grossAmountXaf ||
        !UUID.test(order.quote.quoteId) || !UUID.test(order.quote.payerId) ||
        !['donation','individual_initial'].includes(order.quote.kind) ||
        order.paymentConfirmed!==false || order.membershipGranted!==false ||
        (order.messagingChannel??null)!==(raw?.messagingChannel??null))
      fail('PDC_PUBLIC_COORDINATOR_ORDER_INVALID');

    // Virement hors Tara ; les cartes peuvent emprunter cardLink Tara.
    if (order.method==='virement') {
      return Object.freeze({status:EXTERNAL,paymentId:order.paymentId,
        grossAmountXaf:order.grossAmountXaf,currency:'XAF',
        paymentConfirmed:false,membershipGranted:false});
    }

    // Mobile, Tara messagerie et carte : identité et montant proviennent de
    // la quote PRIVÉE, pas des valeurs formulées par le navigateur.
    const checkout=preparePrivateCheckout({quote:order.quote,
      paymentId:order.paymentId,provider:'tara',idempotencyKey:raw?.idempotencyKey});
    const productId=createProductId();
    if (typeof productId!=='string' || !PRODUCT.test(productId))
      fail('PDC_PUBLIC_COORDINATOR_PRODUCT_INVALID');
    const row=await taraReservations.reserveCheckout({productId,
      paymentId:checkout.paymentId,quoteId:checkout.quoteId,
      payerId:order.quote.payerId,idempotencyKey:checkout.idempotencyKey,
      amountXaf:checkout.amountMinor,currency:'XAF'});
    if (!row || !PRODUCT.test(row.productId) || row.paymentId!==checkout.paymentId ||
        row.quoteId!==checkout.quoteId || row.payerId!==order.quote.payerId ||
        row.idempotencyKey!==checkout.idempotencyKey || row.amountXaf!==checkout.amountMinor ||
        row.currency!=='XAF' ||
        !['reserved','requested','issued','unknown','cancelled'].includes(row.linkState))
      fail('PDC_PUBLIC_COORDINATOR_RESERVATION_INVALID');

    // Émission DEV explicitement activée ; sinon comportement historique sûr.
    if (issueLinks===true) {
      const out=await taraIssuer.issue({order,row,idempotencyKey:checkout.idempotencyKey});
      if (!out || !['issued','manual_review'].includes(out.status))
        fail('PDC_PUBLIC_COORDINATOR_ISSUER_INVALID');
      if (out.status==='issued') {
        const expectedField=order.method==='tara'?TARA_LINK_FIELDS[order.messagingChannel]:
          TARA_LINK_FIELDS[order.method];
        if (!expectedField || out.productId!==row.productId || out.linkField!==expectedField ||
            typeof out.paymentUrl!=='string') fail('PDC_PUBLIC_COORDINATOR_ISSUER_INVALID');
        let safe;
        try {safe=validateStoredTaraChannelLink(out.paymentUrl,{method:order.method,
          messagingChannel:order.messagingChannel});}
        catch {fail('PDC_PUBLIC_COORDINATOR_ISSUER_INVALID');}
        return Object.freeze({status:'issued',paymentId:checkout.paymentId,
          productId:row.productId,linkField:expectedField,paymentUrl:safe.paymentUrl,
          grossAmountXaf:checkout.amountMinor,currency:'XAF',
          paymentConfirmed:false,membershipGranted:false});
      }
      return Object.freeze({status:'manual_review',paymentId:checkout.paymentId,
        grossAmountXaf:checkout.amountMinor,currency:'XAF',
        paymentConfirmed:false,membershipGranted:false});
    }
    // Une requête existante « requested », « issued » ou « unknown » ne doit
    // JAMAIS aboutir à un second appel Tara ou à un lien généraliste.
    const status=row.linkState==='reserved'?PENDING:'manual_review';
    return Object.freeze({status,paymentId:checkout.paymentId,
      grossAmountXaf:checkout.amountMinor,currency:'XAF',
      paymentConfirmed:false,membershipGranted:false});
  }
  return Object.freeze({create});
}
