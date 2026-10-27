// PDC V5-B.6.10-A — client Storage restreint à un test local de sécurité.
// Usage réservé à un opérateur Codespaces, jamais importé dans l'API publique.
export const DEV_PROJECT_REF = 'rvgpnmznhzwlzqyefahd';
export const PORTRAIT_BUCKET = 'pdc-member-portraits-dev';
export const MAX_PORTRAIT_SIZE = 5 * 1024 * 1024;
const BASE = `https://${DEV_PROJECT_REF}.supabase.co/storage/v1`;

export function createPrivateStorageDev({ key, fetchImpl = fetch } = {}) {
  if (typeof key !== 'string' || key.length < 30 || /\s/.test(key)) {
    throw new Error('PDC_STORAGE_CREDENTIAL_MISSING');
  }
  if (typeof fetchImpl !== 'function') throw new Error('PDC_INVALID_FETCH');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  async function request(method, route, { body, contentType, authorized = true } = {}) {
    const res = await fetchImpl(`${BASE}${route}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: authorized ? { ...headers, ...(contentType ? { 'Content-Type': contentType } : {}) }
        : {},
      ...(body === undefined ? {} : { body }),
    });
    return res;
  }
  return {
    async verifyBucket() {
      const r = await request('GET', `/bucket/${PORTRAIT_BUCKET}`);
      if (!r.ok) throw new Error(`PDC_BUCKET_UNAVAILABLE_STATUS_${r.status}`);
      const bucket = await r.json();
      if (bucket.public !== false) throw new Error('PDC_BUCKET_MUST_BE_PRIVATE');
      const size = Number(bucket.file_size_limit ?? bucket.fileSizeLimit);
      if (!Number.isFinite(size) || size < 1 || size > MAX_PORTRAIT_SIZE) {
        throw new Error('PDC_BUCKET_SIZE_LIMIT_INVALID');
      }
      const types = bucket.allowed_mime_types ?? bucket.allowedMimeTypes;
      if (!Array.isArray(types) || types.length !== 2 ||
          !types.includes('image/png') || !types.includes('image/jpeg')) {
        throw new Error('PDC_BUCKET_MIME_LIMIT_INVALID');
      }
      return true;
    },
    async uploadDummy(keyPath, bytes) {
      if (!/^dev-smoketests\/[0-9a-f-]{36}\.png$/.test(keyPath)) throw new Error('PDC_INVALID_TEST_OBJECT_KEY');
      if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_PORTRAIT_SIZE) {
        throw new Error('PDC_TEST_IMAGE_INVALID');
      }
      const r = await request('POST', `/object/${PORTRAIT_BUCKET}/${keyPath}`, {
        body: bytes, contentType: 'image/png',
      });
      if (!r.ok) throw new Error(`PDC_UPLOAD_FAILED_STATUS_${r.status}`);
    },
    async downloadDummy(keyPath) {
      const r = await request('GET', `/object/authenticated/${PORTRAIT_BUCKET}/${keyPath}`);
      if (!r.ok) throw new Error(`PDC_PRIVATE_READ_FAILED_STATUS_${r.status}`);
      const b = Buffer.from(await r.arrayBuffer());
      if (!b.length || b.length > MAX_PORTRAIT_SIZE) throw new Error('PDC_PRIVATE_READ_SIZE_INVALID');
      return b;
    },
    async assertAnonymousDenied(keyPath) {
      for (const route of [
        `/object/public/${PORTRAIT_BUCKET}/${keyPath}`,
        `/object/authenticated/${PORTRAIT_BUCKET}/${keyPath}`,
      ]) {
        const r = await request('GET', route, { authorized: false });
        // Ne jamais retourner un succès sans authentification, y compris via une politique large.
        if (r.ok) throw new Error('PDC_CRITICAL_PORTRAIT_PUBLIC_ACCESS');
        if (![400,401,403,404].includes(r.status)) {
          throw new Error(`PDC_ANONYMOUS_RESULT_INCONCLUSIVE_${r.status}`);
        }
      }
    },
    async removeDummy(keyPath) {
      const r = await request('DELETE', `/object/${PORTRAIT_BUCKET}/${keyPath}`);
      if (!r.ok && r.status !== 404) throw new Error(`PDC_CLEANUP_FAILED_STATUS_${r.status}`);
    },
    async assertDeleted(keyPath) {
      const r = await request('GET', `/object/authenticated/${PORTRAIT_BUCKET}/${keyPath}`);
      if (r.ok || ![400,404].includes(r.status)) throw new Error('PDC_TEST_OBJECT_NOT_CONFIRMED_DELETED');
    },
  };
}
