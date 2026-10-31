// Dépôt R5 : rôle PostgreSQL dédié, sans accès direct aux tables privées.
import {randomBytes,createHash} from 'node:crypto';
import {prepareDiasporaR5} from './diaspora-contract.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=t=>createHash('sha256').update(t).digest('hex');
export async function makeDiasporaR5Repository({pool,enabled=false,environment='disabled'}={}){
  if(enabled!==true||environment!=='sandbox'||typeof pool?.query!=='function')throw Error('PDC_R5_INTAKE_DISABLED');
  const role=(await pool.query('SELECT current_user AS role_name')).rows?.[0]?.role_name;
  if(role!=='pdc_r5_intake_writer')throw Error('PDC_R5_DB_ROLE_INVALID');
  return Object.freeze({
    async create(request){
      const draft=prepareDiasporaR5({request});
      const sessionToken=randomBytes(32).toString('base64url');
      const payload={...draft,intakeSessionSha256:hash(sessionToken)};
      const rows=(await pool.query('SELECT * FROM pdc_private.r5_create_diaspora_dossier_dev($1::jsonb)',
        [JSON.stringify(payload)])).rows;
      const r=rows?.[0];
      if(rows?.length!==1||!UUID.test(r.order_id??'')||!UUID.test(r.payment_id??'')||
        r.provider_amount_xaf!==draft.providerAmountXaf||r.legal_amount_eur_cents!==draft.legalAmountEurCents||
        Number(r.beneficiary_count)!==(draft.formula==='couple'?2:1)||typeof r.session_valid!=='boolean')
          throw Error('PDC_R5_DB_RESULT_INVALID');
      // Rejeu de clé idempotente avec session perdue : ne donne PAS un nouveau secret.
      return Object.freeze({orderId:r.order_id,paymentId:r.payment_id,
        ...(r.session_valid===true?{sessionToken}:{}),
        status:r.session_valid?'submitted_pending_payment':'manual_review',
        grossAmountXaf:r.provider_amount_xaf,legalAmountEurCents:r.legal_amount_eur_cents,
        formula:draft.formula,beneficiaryCount:Number(r.beneficiary_count),
        paymentConfirmed:false,membershipGranted:false,cardIssued:false});
    },
    async issuePhotoGrant({orderId,slot,sessionToken,tokenHash}){
      if(!UUID.test(orderId??'')||!['member','partner'].includes(slot)||
         !/^[A-Za-z0-9_-]{43}$/.test(sessionToken??'')||!/^[a-f0-9]{64}$/.test(tokenHash??''))
        throw Error('PDC_R5_PHOTO_AUTH_INVALID');
      const r=await pool.query('SELECT * FROM pdc_private.r5_photo_issue_dev($1::uuid,$2::text,$3::text,$4::text,$5::integer)',
        [orderId,slot,tokenHash,hash(sessionToken),600]);
      const x=r.rows?.[0];
      if(r.rows?.length!==1||!UUID.test(x?.grant_id??'')||!Number.isFinite(Date.parse(x.expires_at)))
        throw Error('PDC_R5_PHOTO_GRANT_FAILED');
      return {grantId:x.grant_id,expiresAt:x.expires_at};
    }
  });
}
