// Dépôt pré-paiement : une capacité de session demandeur, un jeton photo à usage unique.
// La normalisation JPEG/EXIF, les limites et la vérification SHA viennent de V5-B.
import {createHash,randomBytes} from 'node:crypto';
import {normalizePrivatePortrait} from '../portrait-normalize-v5b610b.mjs';
import {checkTrustedPortraitMetadata} from '../portrait-policy.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Error('PDC_R5_'+code);};
export function provisionalKey(orderId,slot,assetId){
  if(!UUID.test(orderId??'')||!UUID.test(assetId??'')||!['member','partner'].includes(slot))fail('PHOTO_KEY_INVALID');
  return `provisional-r5/${orderId}/${slot}/${assetId}.jpg`;
}
export function makeProvisionalPortraitR5({intake,db,storage,normalize=normalizePrivatePortrait}={}){
  if(typeof intake?.issuePhotoGrant!=='function'||!['reserve','confirm','cancel'].every(x=>typeof db?.[x]==='function')||
     !['upload','download','remove'].every(x=>typeof storage?.[x]==='function'))fail('PHOTO_DEPENDENCIES_INVALID');
  return Object.freeze({
    async issue({orderId,slot,sessionToken}){
      if(!UUID.test(orderId??'')||!['member','partner'].includes(slot)||
         !/^[A-Za-z0-9_-]{43}$/.test(sessionToken??''))fail('PHOTO_AUTH_INVALID');
      const token=randomBytes(32).toString('base64url');
      const r=await intake.issuePhotoGrant({orderId,slot,sessionToken,tokenHash:sha(token)});
      return {token,orderId,slot,expiresAt:r.expiresAt};
    },
    async upload({orderId,slot,token,imageBytes,mime}){
      if(!UUID.test(orderId??'')||!['member','partner'].includes(slot)||
        !/^[A-Za-z0-9_-]{43}$/.test(token??''))fail('PHOTO_REQUEST_INVALID');
      const normalized=await normalize(imageBytes,mime);
      const meta=checkTrustedPortraitMetadata(normalized);
      if(!Buffer.isBuffer(normalized.bytes)||sha(normalized.bytes)!==meta.sha256Hex||
         meta.contentType!=='image/jpeg')fail('PHOTO_NORMALIZATION_INVALID');
      const r=await db.reserve({orderId,slot,tokenHash:sha(token)});
      const key=provisionalKey(orderId,slot,r.assetId);
      if(r.objectKey!==key)fail('PHOTO_KEY_MISMATCH');
      let started=false,confirmStarted=false;
      try{
        started=true;await storage.upload(key,normalized.bytes,'image/jpeg');
        const remote=await storage.download(key);
        if(!Buffer.isBuffer(remote)||sha(remote)!==meta.sha256Hex)fail('PHOTO_STORAGE_CORRUPT');
        confirmStarted=true;await db.confirm({assetId:r.assetId,meta});
        return {status:'stored_private_pending_admission',slot};
      }catch(e){
        // Une panne post-confirmation ne doit PAS effacer un fichier potentiellement lié.
        if(confirmStarted)fail('PHOTO_CONFIRMATION_UNCERTAIN_RECONCILE');
        if(started){try{await storage.remove(key);}catch{fail('PHOTO_STORAGE_CLEANUP_REQUIRED');}}
        try{await db.cancel({assetId:r.assetId});}catch{fail('PHOTO_DB_CLEANUP_REQUIRED');}
        throw e;
      }
    }
  });
}
