// Service prive pour de futurs appels sur le serveur, NON monte dans app.mjs.
// La source de actorId est EXCLUSIVEMENT /auth/v1/user, jamais le navigateur.
import { bearerToken } from './auth.mjs';
import { MAX_PORTRAIT_BYTES } from './portrait-policy.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PortraitPermissionError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function createAuthenticatedPortraitService({ verifyUser, adminReader, ingest }) {
  if (typeof verifyUser !== 'function' || typeof adminReader?.isNationalAdmin !== 'function' ||
      typeof ingest?.uploadForApprovedApplication !== 'function') {
    throw new Error('PDC_PORTRAIT_AUTH_DEPENDENCY_MISSING');
  }
  return {
    async upload({ authorization, cardRequestId, imageBytes, declaredMime }) {
      const token = bearerToken(authorization);
      if (!token) throw new PortraitPermissionError('AUTH_REQUIRED');
      const user = await verifyUser(token); // Supabase Auth reseau, refuse token expire
      if (!user?.id || !UUID.test(user.id)) throw new PortraitPermissionError('INVALID_SESSION');
      if (!await adminReader.isNationalAdmin(user.id)) {
        throw new PortraitPermissionError('NOT_AUTHORIZED');
      }
      if (!UUID.test(cardRequestId ?? '')) throw new Error('PDC_INVALID_CARD_REQUEST');
      if (!(imageBytes instanceof Uint8Array) || imageBytes.byteLength === 0 ||
          imageBytes.byteLength > MAX_PORTRAIT_BYTES) throw new Error('PDC_INVALID_PORTRAIT_SIZE');
      if (!['image/png','image/jpeg'].includes(declaredMime)) throw new Error('PDC_UNSUPPORTED_PORTRAIT_TYPE');
      const result = await ingest.uploadForApprovedApplication({
        actorId: user.id, cardRequestId, imageBytes: Buffer.from(imageBytes), declaredMime,
      });
      // Ne jamais renvoyer ni credentials, ni chemin Storage, ni donnees d'identite.
      return { assetId: result.assetId, cardRequestId: result.cardRequestId, status: 'stored' };
    },
  };
}
