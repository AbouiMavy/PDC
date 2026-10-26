// Pure helpers for the future *trusted server-side* upload path.
// This module never uploads to Supabase and must never be used as proof
// that a client-supplied file has been decoded, normalized or stored.
export const PORTRAIT_BUCKET_DEV = 'pdc-member-portraits-dev';
export const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function portraitObjectKey(cardRequestId, assetId, contentType) {
  if (!UUID.test(cardRequestId ?? '') || !UUID.test(assetId ?? '')) {
    throw new Error('PDC_INVALID_PORTRAIT_REFERENCE');
  }
  const ext = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : null;
  if (!ext) throw new Error('PDC_UNSUPPORTED_PORTRAIT_TYPE');
  return `card-requests/${cardRequestId.toLowerCase()}/${assetId.toLowerCase()}.${ext}`;
}

export function checkTrustedPortraitMetadata({ contentType, fileBytes, sha256Hex, width, height }) {
  if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
    throw new Error('PDC_UNSUPPORTED_PORTRAIT_TYPE');
  }
  if (!Number.isInteger(fileBytes) || fileBytes < 1 || fileBytes > MAX_PORTRAIT_BYTES) {
    throw new Error('PDC_INVALID_PORTRAIT_SIZE');
  }
  if (typeof sha256Hex !== 'string' || !/^[0-9a-f]{64}$/.test(sha256Hex)) {
    throw new Error('PDC_INVALID_PORTRAIT_DIGEST');
  }
  if (![width,height].every(v => Number.isInteger(v) && v >= 240 && v <= 4096)) {
    throw new Error('PDC_INVALID_PORTRAIT_DIMENSIONS');
  }
  return { contentType, fileBytes, sha256Hex, width, height };
}
