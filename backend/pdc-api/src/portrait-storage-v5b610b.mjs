// Adaptateur prive a usage serveur seulement. Ne jamais importer depuis Vite.
import { PORTRAIT_BUCKET_DEV, MAX_PORTRAIT_BYTES } from './portrait-policy.mjs';
const PROJECT = 'rvgpnmznhzwlzqyefahd';
const PATH = /^card-requests\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i;

export function createPortraitStorageV5B610B({ serviceKey, fetchImpl = fetch, projectRef = PROJECT }) {
  if (projectRef !== PROJECT || !serviceKey || serviceKey.length < 30 || /\s/.test(serviceKey))
    throw new Error('PDC_STORAGE_CONFIG_DENIED');
  const base = `https://${PROJECT}.supabase.co/storage/v1`;
  async function request(method, objectKey, bytes, contentType) {
    if (!PATH.test(objectKey)) throw new Error('PDC_PRIVATE_STORAGE_PATH_INVALID');
    const response = await fetchImpl(`${base}/object/${method === 'GET' ? 'authenticated/' : ''}${PORTRAIT_BUCKET_DEV}/${objectKey}`, {
      method,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        ...(contentType ? {'Content-Type':contentType,'x-upsert':'false'} : {}),
      },
      ...(bytes ? {body:bytes} : {}),
      redirect:'error',signal:AbortSignal.timeout(15000),
    });
    if (!response.ok && !(method === 'DELETE' && response.status === 404)) {
      throw new Error(`PDC_STORAGE_REQUEST_FAILED_${response.status}`);
    }
    return response;
  }
  return {
    async upload(path, bytes, contentType) {
      if (contentType !== 'image/jpeg' || !Buffer.isBuffer(bytes) ||
          bytes.length === 0 || bytes.length > MAX_PORTRAIT_BYTES)
        throw new Error('PDC_STORAGE_UPLOAD_INVALID');
      await request('POST',path,bytes,contentType);
    },
    async download(path) {
      const response=await request('GET',path);
      const length=Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_PORTRAIT_BYTES)
        throw new Error('PDC_STORAGE_OVERSIZE_RESPONSE');
      const bytes=Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_PORTRAIT_BYTES)
        throw new Error('PDC_STORAGE_INVALID_RESPONSE');
      return bytes;
    },
    async remove(path) { await request('DELETE',path); },
  };
}
