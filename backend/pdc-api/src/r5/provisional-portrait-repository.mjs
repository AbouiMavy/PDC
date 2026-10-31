// Rôle pdc_r5_photo_writer : réserve/confirme/annule avec jeton SHA-256, aucun SELECT direct.
// UUID regex canonique (8-4-4-4-12) partagée avec les objets privés.
const VALID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
export async function makeProvisionalPhotoRepositoryR5({pool,enabled=false,environment='disabled'}={}){
  if(enabled!==true||environment!=='sandbox'||typeof pool?.query!=='function')throw Error('PDC_R5_PHOTO_DB_DISABLED');
  const role=(await pool.query('SELECT current_user AS role_name')).rows?.[0]?.role_name;
  if(role!=='pdc_r5_photo_writer')throw Error('PDC_R5_PHOTO_ROLE_INVALID');
  return Object.freeze({
    async reserve({orderId,slot,tokenHash}){
      if(!VALID.test(orderId??'')||!['member','partner'].includes(slot)||!SHA.test(tokenHash??''))throw Error('PDC_R5_PHOTO_RESERVE_INVALID');
      const r=await pool.query('SELECT * FROM pdc_private.r5_photo_reserve_dev($1::uuid,$2::text,$3::text)',[orderId,slot,tokenHash]);
      const x=r.rows?.[0];
      if(r.rows?.length!==1||!VALID.test(x?.asset_id??'')||x.object_key!==`provisional-r5/${orderId}/${slot}/${x.asset_id}.jpg`)
        throw Error('PDC_R5_PHOTO_RESERVE_UNTRUSTED');
      return {assetId:x.asset_id,objectKey:x.object_key};
    },
    async confirm({assetId,meta}){
      if(!VALID.test(assetId??'')||!SHA.test(meta?.sha256Hex??''))throw Error('PDC_R5_PHOTO_CONFIRM_INVALID');
      const r=await pool.query('SELECT pdc_private.r5_photo_confirm_dev($1::uuid,$2::integer,$3::text,$4::integer,$5::integer) AS ok',
        [assetId,meta.fileBytes,meta.sha256Hex,meta.width,meta.height]);
      if(r.rows?.[0]?.ok!==true)throw Error('PDC_R5_PHOTO_CONFIRM_FAILED');
      return true;
    },
    async cancel({assetId}){
      if(!VALID.test(assetId??''))throw Error('PDC_R5_PHOTO_CANCEL_INVALID');
      const r=await pool.query('SELECT pdc_private.r5_photo_cancel_dev($1::uuid) AS ok',[assetId]);
      return r.rows?.[0]?.ok===true;
    }
  });
}
