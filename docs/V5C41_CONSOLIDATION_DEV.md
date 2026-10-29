# PDC V5-C.41 — Consolidation DEV (29 octobre 2026)

## Acquis observés
- Commandes de don 500 XAF et d'adhésion individuelle initiale 2 000 XAF enregistrées dans PostgreSQL DEV.
- Liens TaraMoney Sandbox générés et conservés par canal, sans encaissement confirmé.
- Fonction HTTPS `pdc-tara-webhook` déployée dans le projet Supabase `pdc-developpement`.
- Simulation PENDING associée à l'adhésion 2 000 XAF : deux POST, une notification persistée et non vérifiée ; paiement `initiated`, dossier `draft`.
- La Data API Supabase a été activée après une erreur PGRST002 ; exposition de `pdc_private` proscrite.

## Contrat de réception
- `data === true` : RPC indique prise en charge (insertion ou doublon) ; HTTP 200, `received=true`.
- `data === false` : produit inconnu ; HTTP 422, `received=false`.
- Erreur SQL ou retour inattendu : HTTP 503, `received=false`.
- Ce contrat suppose que la RPC SQL DEV renvoie bien `true` en cas de doublon, et `false` pour un produit absent : à vérifier lors du test de non-régression après déploiement.
- La réception d'un webhook (même SUCCESS) ne confirme ni paiement ni adhésion.

## Configuration et précautions
- Exposer `public` via Data API, jamais `pdc_private`; privilèges `anon=false`, `authenticated=false`, `service_role=true` sur la RPC ont été contrôlés.
- Le token de notification PDC et le secret de signature TaraMoney sont deux secrets distincts. Authentification cryptographique fournisseur à traiter en V5-C.42.
- Aucun secret, API key, URL de webhook avec token, donnée d'adhérent ou preuve financière simulée n'est committé.
- Les ports Codespaces sont des outils DEV, sans qualité de serveur de production.

## Hors périmètre de ce lot
- Signature TaraMoney, rapprochement indépendant, écritures de confirmation atomiques, gestion d'incidents et supervision.
- Écarts de conversion EUR/XAF et encodage de `Première adhésion PDC` chez TaraMoney.
- Couverture exhaustive des moyens de paiement et des catégories d'adhésion.
