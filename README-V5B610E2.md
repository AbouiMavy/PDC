# PDC — V5-B.6.10-E2 : autorisations de photographies, DEV

**Portée de ce paquet : registre PostgreSQL des capacités privées, aucune route HTTP, aucun envoi réel, aucune délivrance.** Compatible avec les 13 migrations déjà installées. Projet lié attendu : `rvgpnmznhzwlzqyefahd`. Travail exclusivement sur `feature/v5b`.

## Principe

Un jeton secret opaque de 32 octets aléatoires (`base64url`) peut autoriser un unique dépôt, pour une seule `card_request_id`, pendant **10 min** par défaut et au maximum **15 min**. Le registre stocke **son empreinte SHA-256**, jamais le jeton brut. La consommation est atomique et revérifie le paiement et le dossier; une seconde consommation échoue. Une nouvelle autorisation invalide les précédentes non utilisées. Aucune URL de stockage privée ne sort.

### Limites assumées

- **Pas encore de public upload** : aucune permission d'émission (`issue`) n'est accordée à l'API, à `authenticated` ni au rôle de téléversement. Ce dernier reçoit seulement le droit de **consommer** un jeton émis par un service de paiement fiable, futur.
- **Le paiement de couple reste bloqué** : les schémas actuellement validés ne permettent pas d'affecter de manière sûre un paiement unique de 40 € aux deux adhérents. Les prochains travaux devront modifier le modèle financier avant toute émission pour les conjoints.
- **La preuve de possession de la session de paiement est à développer** : une preuve de paiement vérifié en base ne suffit pas à prouver que la personne qui demande un jeton est celle qui vient d'adhérer. L'API future devra lier la session privée de checkout, le retour du prestataire et les dossiers avant de pouvoir appeler `issue`.
- La procédure SQL d'écriture de portrait V5-B.6.10-B exige actuellement `national_admin`. Une variante pour le dépôt du demandeur, liée à une autorisation consommée, reste nécessaire. **Ne pas** appeler directement la procédure administrative à partir du site.

## Installation

```bash
cd /workspaces/PDC
git switch feature/v5b
unzip -o pdc-v5b610e2-autorisations-privees.zip
node --test tests/v5b610e2-grants.test.mjs
npm run build
npx supabase db push --linked --dry-run
```

Résultat de la simulation attendu : **uniquement** `20261026001400_pdc_v5b610e2_applicant_grants_dev.sql`. Ne pas pousser avant inspection. Le projet 5173/5175/8787 n'a pas besoin d'être redémarré.

Après validation : `npx supabase db push --linked`, puis `npx supabase migration list --linked`, et exécuter `tests/sql/v5b610e2-grants-test.sql` dans Supabase SQL Editor. Ce test utilise une transaction `BEGIN ... ROLLBACK`, sans émission de jeton réel ni modification durable du compteur des membres.

## Sécurité

- Aucune clé `service_role` dans React, dans les tests ou dans Git.
- Les clés techniques désactivées précédemment restent désactivées.
- Le SQL `issue` est **réservé au propriétaire** pour cette étape de DEV, sans permission EXECUTE au runtime actuel.
- Ne pas utiliser les coordonnées ou un numéro militant comme secret de dépôt.
- Si le SQL retourne une erreur, arrêter l'application de la migration plutôt que contourner les contraintes.
