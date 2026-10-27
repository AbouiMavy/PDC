// Adapter for a SEPARATE, restricted PostgreSQL writer connection.
// Do not use the existing readonly pdc_api_runtime_v5b3 connection.
export function createPortraitRepositoryV5B610B({ query }) {
  if (typeof query !== 'function') throw new Error('PDC_DB_ADAPTER_MISSING');
  return {
    async reserve(actorId, cardRequestId, mime) {
      const result = await query('SELECT * FROM pdc_private.portrait_reserve_v5b610b($1::uuid,$2::uuid,$3::text)',
        [actorId,cardRequestId,mime]);
      const row = result.rows?.[0];
      if (!row?.asset_id || !row?.object_key) throw new Error('PDC_DB_RESERVATION_EMPTY');
      return {assetId:row.asset_id,objectKey:row.object_key};
    },
    async confirm(actorId, assetId, meta) {
      const result = await query(
        'SELECT pdc_private.portrait_confirm_v5b610b($1::uuid,$2::uuid,$3::integer,$4::text,$5::integer,$6::integer) AS confirmed',
        [actorId,assetId,meta.fileBytes,meta.sha256Hex,meta.width,meta.height]);
      if (result.rows?.[0]?.confirmed !== true) throw new Error('PDC_DB_CONFIRMATION_FAILED');
    },
    async cancel(actorId, assetId) {
      await query('SELECT pdc_private.portrait_cancel_reservation_v5b610b($1::uuid,$2::uuid)',
        [actorId,assetId]);
    },
  };
}
