import { V5CError } from './contracts.mjs';
const STATES = new Set(['initiated', 'pending', 'confirmed', 'failed', 'cancelled', 'refunded']);
const EVENTS = new Set(['pending', 'confirmed', 'failed', 'cancelled', 'refunded']);
const reject = code => {throw new V5CError(code);};
const AMOUNT = /^[1-9][0-9]{0,18}$/;
const validAmount = v => typeof v === 'string' && AMOUNT.test(v) && BigInt(v) <= 9223372036854775807n;

/** N'accepte que des événements déjà vérifiés côté serveur, par le futur adaptateur Tara. */
export function planVerifiedPaymentTransition(payment, event) {
  if (!payment || !STATES.has(payment.status) || !event || !EVENTS.has(event.status) ||
      payment.provider !== 'tara' || !['XAF', 'EUR'].includes(payment.currency) ||
      !validAmount(payment.amountMinor) || !validAmount(event.amountMinor) ||
      typeof event.providerPaymentId !== 'string' || !event.providerPaymentId ||
      event.providerPaymentId.length > 200 ||
      typeof payment.providerPaymentId !== 'string' ||
      !payment.providerPaymentId || payment.providerPaymentId !== event.providerPaymentId ||
      event.currency !== payment.currency || event.amountMinor !== payment.amountMinor)
    reject('PDC_PAYMENT_RECONCILIATION_MISMATCH');
  if (payment.status === event.status) return Object.freeze({action:'duplicate',status:payment.status});
  // Événements anciens reçus dans le désordre : pas de régression.
  if (payment.status === 'confirmed' && event.status === 'pending')
    return Object.freeze({action:'stale',status:'confirmed'});
  if (payment.status === 'refunded' && ['confirmed','pending'].includes(event.status))
    return Object.freeze({action:'stale',status:'refunded'});
  const allowed = {
    initiated: ['pending','confirmed','failed','cancelled'],
    pending: ['confirmed','failed','cancelled'],
    confirmed: ['refunded'],
    failed: [], cancelled: [], refunded: [],
  };
  if (!allowed[payment.status].includes(event.status))
    return Object.freeze({action:'manual_review',status:payment.status});
  return Object.freeze({action:'transition',status:event.status});
}
