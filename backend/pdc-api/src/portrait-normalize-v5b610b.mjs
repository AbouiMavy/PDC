// Utiliser uniquement sur un serveur de confiance (jamais dans React).
// `sharp` est charge dynamiquement; son installation est reservee au backend.
import { createHash } from 'node:crypto';
import { MAX_PORTRAIT_BYTES, checkTrustedPortraitMetadata } from './portrait-policy.mjs';

export async function normalizePrivatePortrait(input, declaredMime, { sharpFactory } = {}) {
  if (declaredMime !== 'image/jpeg' && declaredMime !== 'image/png')
    throw new Error('PDC_UNSUPPORTED_PORTRAIT_TYPE');
  if (!Buffer.isBuffer(input) && !(input instanceof Uint8Array))
    throw new Error('PDC_INVALID_IMAGE_INPUT');
  if (input.length === 0 || input.length > MAX_PORTRAIT_BYTES)
    throw new Error('PDC_INVALID_PORTRAIT_SIZE');
  const sharp = sharpFactory ?? (await import('sharp')).default;
  let source;
  try {
    source = sharp(Buffer.from(input), { failOn: 'error', limitInputPixels: 16_777_216 });
    const info = await source.metadata();
    const actualMime = info.format === 'jpeg' ? 'image/jpeg' : info.format === 'png' ? 'image/png' : null;
    if (actualMime !== declaredMime) throw new Error('PDC_IMAGE_MIME_MISMATCH');
    if (!info.width || !info.height || info.width < 240 || info.height < 240 ||
        info.width > 4096 || info.height > 4096 || (info.pages ?? 1) > 1) {
      throw new Error('PDC_INVALID_PORTRAIT_DIMENSIONS');
    }
    // Re-encodage complet, EXIF non copie et orientation normalisee; aucun
    // contenu arbitraire du fichier source n'est conserve comme metadata.
    const output = await source.rotate().flatten({ background: '#ffffff' })
      .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 83, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const bytes = Buffer.from(output.data);
    const sha256Hex = createHash('sha256').update(bytes).digest('hex');
    const meta = checkTrustedPortraitMetadata({
      contentType: 'image/jpeg', fileBytes: bytes.length,
      sha256Hex, width: output.info.width, height: output.info.height,
    });
    return { bytes, ...meta };
  } catch (err) {
    if (err?.message?.startsWith('PDC_')) throw err;
    throw new Error('PDC_IMAGE_DECODE_FAILED');
  }
}
