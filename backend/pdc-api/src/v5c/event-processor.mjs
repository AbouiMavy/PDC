import { V5CError } from './contracts.mjs';
import { planVerifiedPaymentTransition } from './reconciliation.mjs';
const fail = code => { throw new V5CError(code); };
const EVENT_ID = /^[A-Za-z0-9:_-]{1,180}$/;
/**
 * ATTENTION : architecture DEV, pas de route HTTP. `verifyProviderEvent` devra être
 * relié à une vérification officielle Tara (signature ou lecture serveur). Il est
 * injecté pour pouvoir tester des événements de façon déterministe.
 * `withTransaction` doit garantir FOR UPDATE, unicité (provider,event_id), COMMIT.
 */
export function makeVerifiedPaymentEventProcessor({verifyProviderEvent,withTransaction}={}) {
  if (typeof verifyProviderEvent !== 'function' || typeof withTransaction !== 'function')
    fail('PDC_PAYMENT_ADAPTER_MISSING');
  return async ({rawBody,headers}={}) => {
    if ((typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) ||
        Buffer.byteLength(rawBody) > 65536 || Buffer.byteLength(rawBody) === 0)
      fail('PDC_PAYMENT_EVENT_BODY_INVALID');
    // Aucune écriture en base et aucun JSON.parse AVANT l'authenticité vérifiée.
    const event = await verifyProviderEvent({rawBody,headers});
    if (!event || event.verified !== true || event.provider !== 'tara' ||
        typeof event.eventId !== 'string' || !EVENT_ID.test(event.eventId) ||
        typeof event.paymentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.paymentId))
      fail('PDC_PROVIDER_PROOF_REQUIRED');
    return withTransaction(async tx => {
      if (!tx || typeof tx.loadPaymentForUpdate !== 'function' ||
          typeof tx.insertEventOnce !== 'function' ||
          typeof tx.updatePaymentStatus !== 'function') fail('PDC_EVENT_DB_CONTRACT_MISSING');
      const payment = await tx.loadPaymentForUpdate(event.paymentId);
      if (!payment) return Object.freeze({action:'unknown_payment'});
      const transition = planVerifiedPaymentTransition(payment,event);
      // La contrainte UNIQUE(provider,provider_event_id) doit être effective en PostgreSQL.
      const inserted = await tx.insertEventOnce({provider:'tara',eventId:event.eventId,paymentId:event.paymentId});
      if (inserted !== true && inserted !== false) fail('PDC_EVENT_DB_CONTRACT_INVALID');
      if (!inserted) return Object.freeze({action:'replayed'});
      if (transition.action === 'transition') await tx.updatePaymentStatus(event.paymentId,transition.status);
      return transition;
    });
  };
}
