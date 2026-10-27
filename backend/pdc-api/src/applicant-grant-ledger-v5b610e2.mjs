// Préparation de capacités opaques et de leur consommation.
// Aucun serveur HTTP et aucune clé service_role. L'émission SQL n'est PAS
// exposée : nécessite une session de checkout vérifiée, non implémentée.
import { randomBytes, createHash } from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=code=>{throw new Error(code);};
const validHash=h=>typeof h==='string' && /^[0-9a-f]{64}$/.test(h);
export function newOpaquePortraitToken() {
  const token=randomBytes(32).toString('base64url');
  return {token,tokenHash:hashPortraitToken(token)};
}
export function hashPortraitToken(token) {
  if(typeof token!=='string' || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) fail('PDC_PORTRAIT_TOKEN_INVALID');
  return createHash('sha256').update(token,'utf8').digest('hex');
}
export function createApplicantGrantRepository({query}) {
  if(typeof query!=='function') fail('PDC_APPLICANT_GRANT_DB_MISSING');
  return {
    // Réservé à un futur service checkout authentifié, pas au rôle upload.
    // Aucune exécution publique de cette fonction en base à ce stade.
    async issueVerified({cardRequestId,paymentId,tokenHash,ttlSeconds=600}) {
      if(!UUID.test(cardRequestId||'')||!UUID.test(paymentId||'')||!validHash(tokenHash)||
         !Number.isInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>900)
        fail('PDC_PORTRAIT_ISSUE_INVALID');
      const r=await query('SELECT pdc_private.applicant_photo_issue_dev_v5b610e2($1::uuid,$2::uuid,$3::text,$4::integer) AS id',
        [cardRequestId,paymentId,tokenHash,ttlSeconds]);
      if(!UUID.test(r.rows?.[0]?.id||'')) fail('PDC_PORTRAIT_ISSUE_FAILED');
      return {authorizationId:r.rows[0].id}; // Jeton brut généré hors SQL.
    },
    async consumeVerifiedGrant({cardRequestId,tokenHash}) {
      if(!UUID.test(cardRequestId||'')||!validHash(tokenHash)) fail('PDC_PORTRAIT_REDEEM_INVALID');
      const r=await query('SELECT * FROM pdc_private.applicant_photo_redeem_v5b610e2($1::uuid,$2::text)',
        [cardRequestId,tokenHash]);
      const x=r.rows?.[0];
      if(!UUID.test(x?.authorization_id||'') || x.card_request_id!==cardRequestId ||
         x.permission!=='portrait:write-once') fail('PDC_APPLICANT_UPLOAD_DENIED');
      return {authorizationId:x.authorization_id,cardRequestId:x.card_request_id,permission:x.permission};
    },
  };
}
