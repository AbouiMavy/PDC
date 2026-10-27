// V5-B.6.10-E — Préparation en mémoire des portraits, sans dépôt ni paiement.
// Une demande de carte et une photographie sont obligatoires pour chaque bénéficiaire.
// Ne jamais utiliser le nom de fichier, l'email ou le numéro militant comme preuve d'identité.
export const MAX_PORTRAIT_BYTES_V5B610E = 5 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PortraitUploadPreparationError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new PortraitUploadPreparationError(code); };
const validFile = f => f && TYPES.has(f.type) && Number.isInteger(f.size) &&
  f.size > 0 && f.size <= MAX_PORTRAIT_BYTES_V5B610E &&
  typeof f.arrayBuffer === 'function';

export function preparePortraitUploadIntent({requestCard, isCouple=false, photoMember, photoPartner}) {
  if (!requestCard) return Object.freeze([]);
  if (!validFile(photoMember)) fail('PDC_PHOTO_MEMBER_REQUIRED_OR_INVALID');
  if (isCouple && (!validFile(photoPartner) || photoPartner === photoMember)) fail('PDC_PHOTO_PARTNER_REQUIRED_OR_INVALID');
  // Les « slot » sont des positions de FORMULAIRE, pas des droits d'accès.
  // La liaison finale à un card_request_id proviendra du backend après paiement.
  const parts = [
    Object.freeze({slot:'member', file:photoMember, declaredMime:photoMember.type}),
    ...(isCouple ? [Object.freeze({slot:'partner',file:photoPartner,declaredMime:photoPartner.type})] : []),
  ];
  return Object.freeze(parts);
}

// Contrat de transfert : l'application ne peut envoyer un fichier que si le
// serveur de paiement a fourni une autorisation individuelle à usage unique.
// Aucun endpoint réel n'est activé par ce module.
export async function transferAuthorizedPortraits({plan, grants, send, now=Date.now()}) {
  if (!Array.isArray(plan) || typeof send !== 'function') fail('PDC_UPLOAD_NOT_READY');
  if (plan.length === 0) return [];
  if (!Array.isArray(grants) || grants.length !== plan.length) fail('PDC_UPLOAD_GRANTS_MISSING');
  const usedSlots=new Set(), usedIds=new Set(), usedTokens=new Set();
  // Valider TOUTES les autorisations avant le moindre octet envoyé.
  for (let i=0;i<plan.length;i++) {
    const item=plan[i], grant=grants[i];
    if (!item || !['member','partner'].includes(item.slot) || !validFile(item.file) ||
        usedSlots.has(item.slot) || !TYPES.has(item.declaredMime) ||
        item.file.type !== item.declaredMime) fail('PDC_UPLOAD_INVALID_PART');
    usedSlots.add(item.slot);
    if (!grant || grant.slot!==item.slot || !UUID.test(grant.cardRequestId || '') ||
        typeof grant.uploadToken !== 'string' || grant.uploadToken.length < 32 || grant.uploadToken.length > 256 || !/^[A-Za-z0-9_-]+$/.test(grant.uploadToken) ||
        !Number.isFinite(grant.expiresAt) || grant.expiresAt<=now ||
        grant.expiresAt>now+15*60*1000 ||
        usedIds.has(grant.cardRequestId) || usedTokens.has(grant.uploadToken))
      fail('PDC_UPLOAD_GRANT_INVALID');
    usedIds.add(grant.cardRequestId); usedTokens.add(grant.uploadToken);
  }
  const results=[];
  for (let i=0;i<plan.length;i++) {
    const item=plan[i], grant=grants[i];
    // Seul l'adaptateur serveur protégé pourra exécuter réellement « send ».
    // Jamais transmettre la clé service_role au navigateur.
    const response=await send({
      slot:item.slot, cardRequestId:grant.cardRequestId,
      uploadToken:grant.uploadToken, bytes:await item.file.arrayBuffer(),
      declaredMime:item.declaredMime,
    });
    if (!response || response.cardRequestId!==grant.cardRequestId ||
        response.status!=='stored') fail('PDC_UPLOAD_RESPONSE_INVALID');
    results.push({slot:item.slot,status:'stored',cardRequestId:grant.cardRequestId});
  }
  return results;
}
