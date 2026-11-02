# PDC-ADM-FIN-001 — Gouvernance des habilitations administratives et financières

Version 1.0 — 2 novembre 2026 — Référence fonctionnelle V5C44-T

## Principe
Les habilitations sont cumulables, non exclusives, explicites, révocables et limitées à leur périmètre. La trésorerie est compétente pour le suivi financier des adhésions, cotisations, dons et autres recettes. Des administrateurs dûment habilités peuvent partager ces compétences. La validation administrative d'une adhésion et la confirmation financière d'un paiement sont des opérations distinctes.

## Matrice initiale
| Opération | national_admin | national_treasury |
| --- | --- | --- |
| Tableau administratif général | Oui | Uniquement avec habilitation administrative additionnelle |
| Consultation des dossiers nécessaires au suivi financier | Selon habilitation | Oui, dans les limites du besoin fonctionnel |
| Synthèse des paiements et cotisations | Selon habilitation financière | Oui |
| Recherche et constat manuel TaraMoney | Avec délégation financière explicite | Oui |
| Confirmation manuelle TaraMoney | Seulement avec national_treasury actif en V5C44-T | Oui |
| Validation administrative d'une adhésion | Oui, selon attribution | Seulement avec habilitation administrative additionnelle |

Le cumul des rôles national_admin et national_treasury est autorisé. Une future délégation de confirmation à d'autres rôles exige une modification explicite et testée de la politique d'autorisation.

## Contrôles obligatoires
1. Vérifier le JWT via Supabase Auth côté serveur ; ne jamais accepter l'identité de l'opérateur depuis le corps de la requête.
2. Vérifier l'habilitation active à chaque requête sensible ; ne jamais réactiver implicitement un rôle expiré.
3. Enregistrer l'identifiant Supabase Auth dans l'audit des opérations financières.
4. Préserver l'historique des revues, empêcher une double comptabilisation et garantir l'atomicité en cas de concurrence.
5. Une transaction peut régler une seule affectation, ou les deux affectations autorisées par V5C45 (frais initiaux et cotisation annuelle). Confirmer le paiement global une seule fois.
6. Le checkout et le webhook ne constituent pas une preuve de paiement confirmée. La vérification manuelle se fait dans le tableau marchand TaraMoney.
7. Aucune modification du parcours public, des données confirmées ou des privilèges sans revue et tests.

Cette note est une spécification fonctionnelle du portail, et non une modification des statuts du parti.
