// V5-B.6.10-E : contrat serveur, non raccordé à app.mjs.
// La preuve de paiement + la correspondance personne/demande et la consommation
// atomique du jeton DOIVENT provenir d'un dépôt SQL privé (future migration).
// Un simple card_request_id, un email ou le numéro militant NE SUFFISENT PAS.
import { createHash } from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX=5*1024*1024;
const fail=code=>{throw new Error(code);};
export function createApplicantPortraitPermissionService({consumeVerifiedGrant, ingestApplicantPortrait}) {
  if (typeof consumeVerifiedGrant!=='function' || typeof ingestApplicantPortrait!=='function')
    fail('PDC_APPLICANT_UPLOAD_DEPENDENCY_MISSING');
  return {
    async submit({cardRequestId, uploadToken, imageBytes, declaredMime}) {
      if (!UUID.test(cardRequestId||'') || typeof uploadToken!=='string' ||
          uploadToken.length<32 || uploadToken.length>256 ||
          !/^[A-Za-z0-9_\-]+$/.test(uploadToken)) fail('PDC_APPLICANT_GRANT_INVALID');
      if (!Buffer.isBuffer(imageBytes) || imageBytes.length===0 || imageBytes.length>MAX ||
          !['image/jpeg','image/png'].includes(declaredMime)) fail('PDC_APPLICANT_FILE_INVALID');
      // Seule empreinte SHA-256 du jeton opaque en DB, jamais le secret brut.
      const tokenHash=createHash('sha256').update(uploadToken,'utf8').digest('hex');
      // consumeVerifiedGrant est un appel SQL atomique, valide aussi l'encaissement,
      // le dossier propre au bénéficiaire, les expirations et les usages uniques.
      const permission=await consumeVerifiedGrant({cardRequestId, tokenHash});
      if (!permission || permission.cardRequestId!==cardRequestId ||
          permission.permission!=='portrait:write-once') fail('PDC_APPLICANT_UPLOAD_DENIED');
      const result=await ingestApplicantPortrait({
        cardRequestId, imageBytes, declaredMime,
        authorizationId:permission.authorizationId,
      });
      if (!result || result.cardRequestId!==cardRequestId || result.status!=='stored')
        fail('PDC_APPLICANT_STORAGE_NOT_CONFIRMED');
      return {cardRequestId,status:'stored'}; // aucune URL privee ni secret
    },
  };
}
