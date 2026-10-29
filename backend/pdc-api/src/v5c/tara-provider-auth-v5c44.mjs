// V5-C.44.1 — Verrou d'authenticité fournisseur, fermé par conception.
// Le jeton privé d'URL PDC n'est PAS une signature cryptographique TaraMoney.
// Aucun format de header, algorithme ni canonisation n'est confirmé par Tara.
export const TARA_PROVIDER_SIGNATURE_CONTRACT_V5C44 = Object.freeze({
  confirmedByProvider: false,
  signatureHeader: null,
  signatureAlgorithm: null,
  signedContent: null,
  replayProtection: null,
});

/** Ne jamais transformer une notification non authentifiée en preuve.
 * Les paramètres éventuels (headers, secret, payload) ne sont pas inspectés
 * tant que le contrat officiel n'est pas connu : refus systématique.
 * Le branchement d'un vérificateur certifié nécessitera un changement de code
 * et des tests dédiés, pas une variable d'environnement activée à la hâte.
 */
export function assessTaraWebhookAuthenticityV5C44() {
  return Object.freeze({
    authenticated: false,
    financialEvidence: false,
    eligibleForSettlement: false,
    reason: 'TARA_PROVIDER_SIGNATURE_CONTRACT_MISSING',
  });
}
