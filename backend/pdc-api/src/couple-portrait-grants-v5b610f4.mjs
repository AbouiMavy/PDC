// V5-B.6.10-F4 — préparation SERVEUR, jamais importée depuis Vite.
// Aucun endpoint HTTP ou délivrance automatique de jeton; l'appelant doit prouver
// séparément identité, possession de la session de paiement et consentements.
import { newOpaquePortraitToken, hashPortraitToken } from './applicant-grant-ledger-v5b610e2.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = () => { throw new Error('PDC_COUPLE_PORTRAIT_GRANTS_INVALID'); };

export function validateCoupleGrantRows(rows, now = Date.now(), ttlSeconds = 600) {
  if (!Array.isArray(rows) || rows.length !== 2 || !Number.isFinite(now) ||
      !Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 900) fail();
  const grants = new Map();
  for (const row of rows) {
    if (!row || !['member','partner'].includes(row.beneficiary_slot) ||
        grants.has(row.beneficiary_slot) || !UUID.test(row.card_request_id ?? '') ||
        !UUID.test(row.grant_id ?? '')) fail();
    const expiresAt = new Date(row.expires_at).getTime();
    // Écart d'horloges de 60 secondes maximum. Date prise du serveur SQL.
    if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + ttlSeconds * 1000 + 60000) fail();
    grants.set(row.beneficiary_slot, {
      slot: row.beneficiary_slot,
      cardRequestId: row.card_request_id.toLowerCase(),
      authorizationId: row.grant_id.toLowerCase(),
      expiresAt,
    });
  }
  if (!grants.has('member') || !grants.has('partner')) fail();
  const a = grants.get('member'), b = grants.get('partner');
  if (a.cardRequestId === b.cardRequestId || a.authorizationId === b.authorizationId) fail();
  return Object.freeze([Object.freeze(a), Object.freeze(b)]);
}

export function createCouplePortraitGrantIssuer({ query, tokenFactory = newOpaquePortraitToken, clock = Date.now } = {}) {
  if (typeof query !== 'function' || typeof tokenFactory !== 'function' || typeof clock !== 'function') fail();
  return Object.freeze({
    // A appeler uniquement depuis un futur contrôleur de checkout AUTHENTIFIÉ,
    // jamais depuis le formulaire public ni l'API readonly existante.
    async prepareTrustedPair({ orderId, ttlSeconds = 600 } = {}) {
      if (!UUID.test(orderId ?? '') || !Number.isInteger(ttlSeconds) ||
          ttlSeconds < 60 || ttlSeconds > 900) fail();
      const first = tokenFactory();
      const second = tokenFactory();
      if (!first || !second || first.token === second.token ||
          !/^[A-Za-z0-9_-]{43}$/.test(first.token ?? '') ||
          !/^[A-Za-z0-9_-]{43}$/.test(second.token ?? '') ||
          !/^[0-9a-f]{64}$/.test(first.tokenHash ?? '') ||
          !/^[0-9a-f]{64}$/.test(second.tokenHash ?? '') ||
          first.tokenHash === second.tokenHash ||
          hashPortraitToken(first.token) !== first.tokenHash ||
          hashPortraitToken(second.token) !== second.tokenHash) fail();
      const { rows } = await query(
        'SELECT * FROM pdc_private.couple_photo_issue_pair_dev_v5b610f4($1::uuid,$2::text,$3::text,$4::integer)',
        [orderId, first.tokenHash, second.tokenHash, ttlSeconds],
      );
      const validated = validateCoupleGrantRows(rows, clock(), ttlSeconds);
      // Les jetons sont retournés à un service DE CONFIANCE ; ne jamais les logger.
      return Object.freeze(validated.map((grant, index) => Object.freeze({
        ...grant,
        uploadToken: index === 0 ? first.token : second.token,
      })));
    },
  });
}
