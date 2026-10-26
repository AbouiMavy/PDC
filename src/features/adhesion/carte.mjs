/** V5-B.6 — validations utilisables dans le navigateur ET testables sous Node.
 * Aucun numéro officiel n'est généré dans le navigateur : format uniquement.
 */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png']);

export function validatePhoto(photo) {
  if (!photo) return 'photoMember';
  if (!PHOTO_MIME_TYPES.includes(photo.type)) return 'photoType';
  if (!Number.isSafeInteger(photo.size) || photo.size <= 0 || photo.size > PHOTO_MAX_BYTES) return 'photoSize';
  return null;
}

export function validateCardSelection({requestCard, isCouple, photoMember, photoPartner}) {
  if (!requestCard) return null;
  const m = validatePhoto(photoMember);
  if (m) return m;
  if (isCouple) {
    if (!photoPartner) return 'photoPartner';
    const p = validatePhoto(photoPartner);
    if (p) return p;
  }
  return null;
}

/** Simple contrôle de format, réservé aux tests/à l'administration.
 * L'attribution UNIQUE doit se faire en transaction PostgreSQL côté serveur.
 */
export function formatInternetMemberNumber(sex, sequenceNumber) {
  if (!['M','F'].includes(sex) || !Number.isSafeInteger(sequenceNumber) || sequenceNumber < 1 || sequenceNumber > 999999) {
    throw new RangeError('Numéro de membre Internet invalide');
  }
  return `${sex}-PDC-I-${String(sequenceNumber).padStart(6, '0')}`;
}
export const internetNumberPattern = /^[MF]-PDC-I-[0-9]{6}$/;
