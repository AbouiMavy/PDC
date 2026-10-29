// Orchestrateur V5-C DEV, hors HTTP et hors navigateur.
// Les effets sont injectes et les autorisations SQL restent fermees par defaut.
import { V5CError } from './contracts.mjs';
import { prepareTaraCheckoutDraft } from './tara-checkout-v5c.mjs';
import { newTaraProductId, validateTaraProductId, parseTaraLinkResponse } from './tara-server-client-v5c.mjs';
import { inspectUntrustedTaraWebhook } from './tara-webhook-v5c.mjs';
import { reconcileTaraProduct } from './tara-reconciliation-v5c.mjs';

const fail = code => { throw new V5CError(code); };
const methods = [ 'reserveCheckout', 'claimLinkRequest', 'saveIssuedLink', 'markLinkUnknown',
  'insertUntrustedWebhookOnce', 'loadCheckout', 'recordEvidence' ];
const same = (a,b) => a === b;

/** enabled indique seulement la permission de construire ce service DEV ;
 * le client Tara impose separement environment=sandbox ET allowNetwork=true.
 * Aucun role SQL n'est accorde par la migration.
 */
export function makeTaraDevService({repository,taraClient,expectedBusinessId,
  returnUrl,webHookUrl,enabled=false,environment='disabled'}={}) {
  if (enabled!==true || environment!=='sandbox') fail('PDC_TARA_DEV_DISABLED');
  if (!repository || methods.some(m=>typeof repository[m]!=='function') ||
      !taraClient || typeof taraClient.createPaymentLink!=='function' ||
      typeof taraClient.checkMobileStatus!=='function' ||
      typeof taraClient.listTransactions!=='function' ||
      typeof expectedBusinessId!=='string' || expectedBusinessId.length<1 ||
      expectedBusinessId.length>128)
    fail('PDC_TARA_DEV_DEPENDENCY_INVALID');

  /** quote doit provenir de quoteFromPrivateDb() uniquement, apres verification
   * SQL privee du paiement deja cree. Pas de quote ni montant depuis React.
   */
  async function initiate({quote,paymentId,idempotencyKey}={}) {
    const draft = prepareTaraCheckoutDraft({quote,paymentId,idempotencyKey,
      productId:newTaraProductId(),returnUrl,webHookUrl});
    const row = await repository.reserveCheckout({
      productId:draft.productId,paymentId:draft.checkout.paymentId,
      quoteId:draft.checkout.quoteId,payerId:quote.payerId,
      idempotencyKey:draft.checkout.idempotencyKey,
      amountXaf:draft.checkout.amountMinor,currency:draft.checkout.currency,
    });
    if (!row || typeof row!=='object' || !row.productId ||
        !same(row.paymentId,draft.checkout.paymentId) ||
        !same(row.quoteId,draft.checkout.quoteId) ||
        !same(row.payerId,quote.payerId) ||
        !same(row.idempotencyKey,draft.checkout.idempotencyKey) ||
        !same(row.amountXaf,draft.checkout.amountMinor) ||
        row.currency!=='XAF') fail('PDC_TARA_IDEMPOTENCY_CONFLICT');
    validateTaraProductId(row.productId);
    // L'idempotence de creation previent un second appel prestataire, meme
    // apres un timeout ambigu ou un redemarrage Node.
    if (row.linkState==='issued' && typeof row.generalLink==='string') {
      const {generalLink}=parseTaraLinkResponse({status:'success',generalLink:row.generalLink});
      return Object.freeze({productId:row.productId,status:'issued',generalLink});
    }
    if (row.linkState==='unknown' || row.linkState==='requested' || row.linkState==='cancelled')
      return Object.freeze({productId:row.productId,status:'manual_review'});
    if (row.linkState!=='reserved') fail('PDC_TARA_LINK_STATE_INVALID');
    // L'instance peut avoir vu un idempotencyKey deja reserve : l'entree
    // reselectionnee peut avoir un productId different de celui genere.
    const input = row.productId===draft.productId ? draft.taraInput :
      prepareTaraCheckoutDraft({quote,paymentId,idempotencyKey,
        productId:row.productId,returnUrl,webHookUrl}).taraInput;
    if (await repository.claimLinkRequest(row.productId)!==true)
      return Object.freeze({productId:row.productId,status:'manual_review'});
    let links;
    try {
      links=await taraClient.createPaymentLink(input);
      links=parseTaraLinkResponse({status:'success',generalLink:links?.generalLink});
      await repository.saveIssuedLink(row.productId,links.generalLink);
    } catch {
      // Un timeout peut survenir apres la creation effective du lien.
      // AUCUNE relance automatique de createPaymentLink.
      try { await repository.markLinkUnknown(row.productId); } catch { /* alerte operationnelle requise */ }
      return Object.freeze({productId:row.productId,status:'manual_review'});
    }
    return Object.freeze({productId:row.productId,status:'issued',generalLink:links.generalLink});
  }

  /** L'absence de signature fournisseur interdit de faire confiance au webhook.
   * Un webhook duplique reste une seule ligne d'inbox, JAMAIS une confirmation.
   */
  async function receiveWebhook(rawBody) {
    const hint=inspectUntrustedTaraWebhook(rawBody,expectedBusinessId);
    const inserted=await repository.insertUntrustedWebhookOnce(hint);
    if (inserted!==true && inserted!==false) fail('PDC_TARA_WEBHOOK_STORE_INVALID');
    return Object.freeze({accepted:true,duplicate:!inserted,verified:false});
  }

  /** Planification de rapprochement sans muter payment_attempts, obligations,
   * cartes, admission ou tresorerie. La table evidence est purement auxiliaire.
   */
  async function inspectPayment({productId,paymentChannel='mobile',maxPages=10}={}) {
    validateTaraProductId(productId);
    const row=await repository.loadCheckout(productId);
    if (!row || row.productId!==productId || row.linkState!=='issued' ||
        row.currency!=='XAF' || typeof row.amountXaf!=='string')
      fail('PDC_TARA_INTENT_NOT_READY');
    const result=await reconcileTaraProduct({client:taraClient,productId,
      expectedAmountXaf:row.amountXaf,paymentChannel,maxPages});
    if (result.productId!==productId ||
        !['corroborated','not_verified','manual_review'].includes(result.decision))
      fail('PDC_TARA_EVIDENCE_INVALID');
    await repository.recordEvidence({productId,decision:result.decision,
      reason:result.reason??null,expectedAmountXaf:row.amountXaf,paymentChannel});
    return Object.freeze({productId,decision:result.decision,reason:result.reason??null,
      paymentConfirmed:false,admissionGranted:false});
  }
  return Object.freeze({initiate,receiveWebhook,inspectPayment});
}
