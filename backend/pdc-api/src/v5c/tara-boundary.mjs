// Le SDK React rapporte l'interface et le résultat affiché, PAS la vérité comptable.
import { V5CError } from './contracts.mjs';
/** Normalisation minimale d'un callback SDK non fiable. Aucun statut 'confirmed' émis. */
export function recordUntrustedTaraClientHint(receipt) {
  if (!receipt || typeof receipt.reference !== 'string' ||
      !/^[A-Za-z0-9_:-]{1,160}$/.test(receipt.reference))
    throw new V5CError('PDC_TARA_CLIENT_REFERENCE_INVALID');
  return Object.freeze({provider:'tara',reference:receipt.reference,verification:'required',status:'unverified'});
}
/** Fail closed : ne jamais exporter une clé non publique vers le bundle Vite. */
export function validateTaraSandboxMetadata({environment, businessId, publicApiKey}) {
  if (environment !== 'sandbox') throw new V5CError('PDC_TARA_SANDBOX_ONLY');
  if (typeof businessId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(businessId))
    throw new V5CError('PDC_TARA_BUSINESS_INVALID');
  if (typeof publicApiKey !== 'string' || publicApiKey.length < 8 || publicApiKey.length > 512)
    throw new V5CError('PDC_TARA_PUBLIC_KEY_INVALID');
  // Ne PAS placer cette métadonnée dans VITE_*, localStorage ou un bundle avant
  // d'avoir confirmé par écrit le caractère public de la clé chez TaraMoney.
  return Object.freeze({environment:'sandbox',businessId,readyForServerSideIntegration:true});
}
