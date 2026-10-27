// Depot demandeur DEV : droits SQL distincts du parcours national_admin.
// Seul le role pdc_portrait_upload_runtime_v5b610c execute ces fonctions.
import { portraitObjectKey, checkTrustedPortraitMetadata } from './portrait-policy.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;
const fail = code => { throw new Error(code); };
export function createApplicantPortraitRepositoryV5B610F1({query}) {
  if (typeof query!=='function') fail('PDC_APPLICANT_DB_MISSING');
  return {
    async reserve({cardRequestId,tokenHash}) {
      if (!UUID.test(cardRequestId??'') || !SHA.test(tokenHash??'')) fail('PDC_APPLICANT_RESERVE_INVALID');
      const {rows}=await query(
        'SELECT * FROM pdc_private.applicant_portrait_reserve_v5b610f1($1::uuid,$2::text,$3::text)',
        [cardRequestId,tokenHash,'image/jpeg']);
      const x=rows?.[0];
      if (!UUID.test(x?.asset_id??'') || !UUID.test(x?.authorization_id??'') ||
          x?.object_key!==portraitObjectKey(cardRequestId,x.asset_id,'image/jpeg'))
        fail('PDC_APPLICANT_RESERVATION_UNTRUSTED');
      return {assetId:x.asset_id,authorizationId:x.authorization_id,objectKey:x.object_key};
    },
    async confirm({authorizationId,assetId,meta}) {
      if (!UUID.test(authorizationId??'') || !UUID.test(assetId??'')) fail('PDC_APPLICANT_CONFIRM_INVALID');
      const data=checkTrustedPortraitMetadata(meta);
      if (data.contentType!=='image/jpeg') fail('PDC_APPLICANT_CONFIRM_MIME_DENIED');
      const {rows}=await query(
        'SELECT pdc_private.applicant_portrait_confirm_v5b610f1($1::uuid,$2::uuid,$3::integer,$4::text,$5::integer,$6::integer) AS confirmed',
        [authorizationId,assetId,data.fileBytes,data.sha256Hex,data.width,data.height]);
      if (rows?.[0]?.confirmed!==true) fail('PDC_APPLICANT_CONFIRM_FAILED');
      return true;
    },
    async cancel({authorizationId,assetId}) {
      if (!UUID.test(authorizationId??'') || !UUID.test(assetId??'')) fail('PDC_APPLICANT_CANCEL_INVALID');
      const {rows}=await query(
        'SELECT pdc_private.applicant_portrait_cancel_v5b610f1($1::uuid,$2::uuid) AS cancelled',
        [authorizationId,assetId]);
      return rows?.[0]?.cancelled===true;
    },
  };
}
