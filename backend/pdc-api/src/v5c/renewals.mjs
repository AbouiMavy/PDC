import { V5CError } from './contracts.mjs';
const fail = () => { throw new V5CError('PDC_RENEWAL_AUTH_REQUIRED'); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Contrat interne : aucun lookup par numéro de militant/e-mail seuls. */
export function authorizeRenewalAccount({verifiedAuthUserId, dbLink}) {
  if (typeof verifiedAuthUserId !== 'string' || !UUID.test(verifiedAuthUserId) ||
      !dbLink || typeof dbLink.auth_user_id !== 'string' ||
      dbLink.auth_user_id.toLowerCase() !== verifiedAuthUserId.toLowerCase() ||
      typeof dbLink.membership_id !== 'string' || !UUID.test(dbLink.membership_id) ||
      !dbLink.verified_at || Number.isNaN(Date.parse(dbLink.verified_at))) fail();
  return Object.freeze({membershipId: dbLink.membership_id.toLowerCase()});
}
