// Orchestration du depot demandeur avec preuve E2.
// Aucune emission de jeton et aucune lecture directe de table SQL.
import { createHash } from 'node:crypto';
import { hashPortraitToken } from './applicant-grant-ledger-v5b610e2.mjs';
import { normalizePrivatePortrait } from './portrait-normalize-v5b610b.mjs';
import { checkTrustedPortraitMetadata, portraitObjectKey } from './portrait-policy.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw new Error(code);};

export function createApplicantPortraitIngestV5B610F1({repository,storage,normalize=normalizePrivatePortrait}) {
  for (const method of ['reserve','confirm','cancel']) {
    if (typeof repository?.[method]!=='function') fail('PDC_APPLICANT_DB_MISSING');
  }
  for (const method of ['upload','download','remove']) {
    if (typeof storage?.[method]!=='function') fail('PDC_APPLICANT_STORAGE_MISSING');
  }
  if (typeof normalize!=='function') fail('PDC_APPLICANT_NORMALIZE_MISSING');
  return {
    async submit({cardRequestId,uploadToken,imageBytes,declaredMime}) {
      if (!UUID.test(cardRequestId??'')) fail('PDC_APPLICANT_REFERENCE_INVALID');
      // Le token brut n'est jamais logue, stocke ni transmis comme parametre SQL.
      const tokenHash=hashPortraitToken(uploadToken);
      // Decode avant de consommer le jeton, validation mime/dimensions et retrait EXIF.
      const normalized=await normalize(imageBytes,declaredMime);
      const data=checkTrustedPortraitMetadata(normalized);
      if (data.contentType!=='image/jpeg' || !Buffer.isBuffer(normalized.bytes) ||
          digest(normalized.bytes)!==data.sha256Hex || data.fileBytes!==normalized.bytes.length)
        fail('PDC_APPLICANT_NORMALIZER_INVALID');

      // Un seul appel SQL consomme E2 et cree la reservation atomiquement.
      const {assetId,authorizationId,objectKey}=await repository.reserve({cardRequestId,tokenHash});
      if (objectKey!==portraitObjectKey(cardRequestId,assetId,'image/jpeg')) {
        // Ne jamais utiliser un objectKey arbitraire fourni par un adaptateur SQL.
        try { await repository.cancel({authorizationId,assetId}); } catch {}
        fail('PDC_APPLICANT_STORAGE_PATH_DENIED');
      }
      let started=false;
      let confirmationStarted=false;
      try {
        started=true;
        await storage.upload(objectKey,normalized.bytes,'image/jpeg');
        const remote=await storage.download(objectKey);
        if (!Buffer.isBuffer(remote) || digest(remote)!==data.sha256Hex)
          fail('PDC_APPLICANT_STORAGE_INTEGRITY_FAILED');
        confirmationStarted=true;
        await repository.confirm({authorizationId,assetId,meta:data});
        return {cardRequestId,status:'stored'};
      } catch (error) {
        // Confirmation peut avoir commite avant une perte de connexion :
        // NE PAS retirer l'objet, au risque de rompre le lien en base.
        if (confirmationStarted) fail('PDC_APPLICANT_CONFIRMATION_UNCERTAIN_RECONCILE');
        if (started) {
          try { await storage.remove(objectKey); }
          catch { fail('PDC_APPLICANT_STORAGE_CLEANUP_REQUIRED'); }
        }
        try { await repository.cancel({authorizationId,assetId}); }
        catch { fail('PDC_APPLICANT_DB_CLEANUP_REQUIRED'); }
        throw error;
      }
    },
  };
}
