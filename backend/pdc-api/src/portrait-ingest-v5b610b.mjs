// Orchestrateur de televersement. Non raccorde a l'API publique.
// Les interfaces injectees representent un backend authentifie et privilegie,
// pas des parametres provenant du navigateur.
import { createHash } from 'node:crypto';
import { normalizePrivatePortrait } from './portrait-normalize-v5b610b.mjs';
import { portraitObjectKey } from './portrait-policy.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createPortraitIngestService({ repository, storage, normalize = normalizePrivatePortrait }) {
  for (const method of ['reserve','confirm','cancel']) {
    if (typeof repository?.[method] !== 'function') throw new Error('PDC_REGISTRY_ADAPTER_MISSING');
  }
  for (const method of ['upload','download','remove']) {
    if (typeof storage?.[method] !== 'function') throw new Error('PDC_STORAGE_ADAPTER_MISSING');
  }
  return {
    async uploadForApprovedApplication({ actorId, cardRequestId, imageBytes, declaredMime }) {
      if (!UUID.test(actorId ?? '') || !UUID.test(cardRequestId ?? ''))
        throw new Error('PDC_INVALID_IDENTITY_REFERENCE');
      // Decoder AVANT de reserver quoi que ce soit dans la base.
      const normalized = await normalize(imageBytes, declaredMime);
      if (normalized.contentType !== 'image/jpeg' || !Buffer.isBuffer(normalized.bytes) ||
          !/^[0-9a-f]{64}$/.test(normalized.sha256Hex) ||
          createHash('sha256').update(normalized.bytes).digest('hex') !== normalized.sha256Hex)
        throw new Error('PDC_PORTRAIT_NORMALIZER_INVALID');
      const { assetId, objectKey } = await repository.reserve(actorId,cardRequestId,'image/jpeg');
      // Ne JAMAIS faire confiance au chemin recu sans recalcule independamment.
      if (objectKey !== portraitObjectKey(cardRequestId,assetId,'image/jpeg')) {
        try { await repository.cancel(actorId,assetId); } catch {}
        throw new Error('PDC_REGISTRY_OBJECT_PATH_MISMATCH');
      }
      let uploadStarted = false;
      let confirmationStarted = false;
      try {
        uploadStarted = true;
        await storage.upload(objectKey,normalized.bytes,'image/jpeg'); // upsert interdit
        const downloaded = await storage.download(objectKey);
        if (createHash('sha256').update(downloaded).digest('hex') !== normalized.sha256Hex)
          throw new Error('PDC_STORAGE_INTEGRITY_FAILED');
        confirmationStarted = true;
        await repository.confirm(actorId,assetId,{
          fileBytes:normalized.fileBytes, sha256Hex:normalized.sha256Hex,
          width:normalized.width,height:normalized.height,
        });
        return { assetId, cardRequestId, status:'stored' }; // jamais l'URL privee
      } catch (cause) {
        // Une perte reseau pendant la confirmation SQL peut survenir APRES COMMIT.
        // Ne pas supprimer le fichier : il pourrait deja etre reference par la DB.
        if (confirmationStarted) {
          throw new Error('PDC_CONFIRMATION_UNCERTAIN_RECONCILE');
        }
        if (uploadStarted) {
          try { await storage.remove(objectKey); }
          catch { throw new Error('PDC_CLEANUP_REQUIRES_MANUAL_ACTION'); }
        }
        try { await repository.cancel(actorId,assetId); }
        catch { throw new Error('PDC_REGISTRY_CLEANUP_REQUIRES_MANUAL_ACTION'); }
        throw cause;
      }
    },
  };
}
