// V5-C — noyau DEV exclusivement serveur. Aucun endpoint public ni checkout actif.
// Ne jamais appeler ces fonctions avec une "preuve" ou un prix provenant du navigateur.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY = /^(?:[1-9][0-9]{0,18})$/;
const QUOTE_BRAND = Symbol('trusted-private-db-quote');
const MAX_BIGINT = 9223372036854775807n;

export class V5CError extends Error {
  constructor(code) { super(code); this.name = 'V5CError'; this.code = code; }
}
const reject = code => { throw new V5CError(code); };
const uuid = x => typeof x === 'string' && UUID.test(x);
const normalizedId = x => x.toLowerCase();
const money = x => {
  const text = typeof x === 'string' ? x : ''; // bigint/JS number refusés : risque de précision.
  if (!MONEY.test(text) || BigInt(text) > MAX_BIGINT) reject('PDC_AMOUNT_INVALID');
  return text;
};
const kinds = new Set(['individual_initial', 'couple_initial', 'renewal', 'donation']);

/** À appeler uniquement sur une ligne retournée par la base privée, jamais sur request.body. */
export function quoteFromPrivateDb(row) {
  if (!row || !uuid(row.quote_id) || !uuid(row.payer_id) ||
      !kinds.has(row.kind) || !['EUR', 'XAF'].includes(row.currency)) reject('PDC_QUOTE_INVALID');
  const amountMinor = money(row.amount_minor);
  if (!Array.isArray(row.beneficiary_ids)) reject('PDC_BENEFICIARIES_INVALID');
  const beneficiaryIds = row.beneficiary_ids.map(x => {
    if (!uuid(x)) reject('PDC_BENEFICIARIES_INVALID');
    return normalizedId(x);
  });
  if (new Set(beneficiaryIds).size !== beneficiaryIds.length) reject('PDC_BENEFICIARIES_DUPLICATE');
  if (row.kind === 'couple_initial') {
    // EXACTEMENT UNE opération à 40 EUR, DEUX bénéficiaires distincts.
    if (row.currency !== 'EUR' || amountMinor !== '4000' || beneficiaryIds.length !== 2)
      reject('PDC_COUPLE_BUNDLE_INVALID');
  } else if (row.kind === 'individual_initial' || row.kind === 'renewal') {
    if (beneficiaryIds.length !== 1) reject('PDC_BENEFICIARIES_INVALID');
  } else if (beneficiaryIds.length !== 0) reject('PDC_DONATION_BENEFICIARIES_INVALID');
  const quote = {
    quoteId: normalizedId(row.quote_id), payerId: normalizedId(row.payer_id),
    kind: row.kind, amountMinor, currency: row.currency,
    beneficiaryIds: Object.freeze(beneficiaryIds),
  };
  Object.defineProperty(quote, QUOTE_BRAND, {value: true, enumerable: false});
  return Object.freeze(quote);
}

/** Préparation sans paiement ; références persistées par le backend, jamais choisies par React. */
export function preparePrivateCheckout({quote, paymentId, provider, idempotencyKey}) {
  if (!quote?.[QUOTE_BRAND]) reject('PDC_TRUSTED_QUOTE_REQUIRED');
  if (!uuid(paymentId)) reject('PDC_PAYMENT_ID_INVALID');
  if (provider !== 'tara') reject('PDC_PROVIDER_INVALID');
  if (typeof idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9:_-]{16,128}$/.test(idempotencyKey)) reject('PDC_IDEMPOTENCY_INVALID');
  return Object.freeze({
    paymentId: normalizedId(paymentId), quoteId: quote.quoteId,
    amountMinor: quote.amountMinor, currency: quote.currency,
    provider, idempotencyKey,
    // L'initiation effective et les autorisations SQL ne sont PAS exposées en V5-C.0.
    state: 'not_started',
  });
}
