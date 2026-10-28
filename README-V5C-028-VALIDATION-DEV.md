# PDC · V5-C.28 · Validation de la base DEV et des cinq canaux (28 octobre 2026)

**Périmètre :** lot **de vérification** non intrusif après V5-C.27 ; aucune nouvelle migration, aucun déploiement, aucun paiement réel, aucun changement de tarifs ou des formulaires. Le contenu est destiné à un **projet Supabase DEV isolé**, jamais à la production.

## Ce que cette livraison fait réellement

1. Contrôle **hors réseau** de la présence et de certaines invariantes des migrations 020/021/023/027 et des modules serveur par `scripts/v5c28-preflight.mjs`. C'est un garde-fou statique, **pas une exécution SQL**.
2. Diagnostics SQL lecture seule du catalogue (`v5c28-catalogue-dev.sql`) : présence des tables, rôle dédié et fonctions. Ce diagnostic est utile **avant** d'appliquer quoi que ce soit pour connaître l'état de la base.
3. Contrôle des privilèges et de RLS (`v5c28-privileges-dev.sql`) **après** les migrations, en lecture seule : refus de droits `anon`, `authenticated`, `service_role` et de droits directs du rôle `pdc_tara_v5c_writer` sur les nouvelles tables ; seuls les RPC vérifiés lui sont accessibles.
4. Test SQL intégré **entièrement annulé** (`v5c28-parcours-cinq-canaux-rollback.sql`) : crée cinq commandes fictives de 500 XAF, vérifie le montant brut et l'idempotence, réserve cinq produits Tara fictifs, associe chaque méthode à son lien prévu, vérifie la relecture et empêche un deuxième enregistrement. Aucun appel externe, aucune confirmation de paiement. Le `ROLLBACK` efface les données de test.
5. Tests Node locaux du dispositif. **Aucune clé ou URL de paiement réelle nécessaire.**

## Installation dans Codespaces

Téléverser `PDC_V5C_028_validation_dev.zip` à la racine `/workspaces/PDC-v5c` :

```bash
cd /workspaces/PDC-v5c
unzip -n PDC_V5C_028_validation_dev.zip
bash scripts/v5c28-validate-local.sh
```

Le script lance la revue des fichiers, ses propres tests, les tests backend et frontend, le build, puis `git diff --check` et `git status --short`. **Il ne pousse rien vers Supabase ou GitHub.** Les fichiers `??` sont normaux avant ajout et ne sont pas vérifiés par `git diff --check` ; les tests des nouveaux fichiers s'exécutent néanmoins.

Si le précontrôle échoue, ne pas forcer : relever le fichier manquant. Un `FAIL` 020 ou 021 peut indiquer qu'une ancienne migration ne figure pas dans la branche locale, même si elle a déjà été appliquée en base ; ne pas dupliquer une migration pour résoudre le test.

## Ordre des trois opérations Supabase (une séance séparée, après audit)

**A. Faire d'abord un constat, sans changer la base.** Dans le tableau de bord Supabase du **projet DEV clairement identifié**, ouvrir le SQL Editor, coller et exécuter `tests/sql/v5c28-catalogue-dev.sql`. Vérifier les booléens retournés. Les informations sont limitées au nom de base, au rôle et à la présence de schémas/fonctions.

**B. Réconcilier l'historique.** Si 020, 021, 023 ou 027 sont manquantes, faire vérifier leur ordre, leur contenu exact **et** l'historique des migrations. N'exécuter aucune migration qui a déjà été appliquée, même si un fichier a été corrigé après coup. Les migrations 023 et 027 requièrent notamment la version 023 corrigée pour le lien `application_id` et le paiement carte via Tara. **Ne pas exécuter `supabase db push` en bloc.** Le rôle 021 est initialement créé avec `PASSWORD NULL` : son provisionnement et sa connexion TLS restent une décision de déploiement distincte.

**C. Après validation des migrations en DEV :** exécuter `tests/sql/v5c28-privileges-dev.sql`, puis `tests/sql/v5c28-parcours-cinq-canaux-rollback.sql` dans le SQL Editor **DEV**. Ce dernier crée des écritures fictives dans une transaction et les annule avec `ROLLBACK`. Si une commande SQL échoue, PostgreSQL abandonne la transaction ; la vérifier et la terminer par `ROLLBACK` si nécessaire.

### Résultats attendus

- Le diagnostic de catalogue signale les prérequis attendus comme présents.
- Le contrôle de droits affiche : `V5-C.28 : privilèges et RLS attendus vérifiés`.
- Le scénario SQL affiche **cinq notices** `OK: canal 1..5`, puis une notice de clôture. Aucun encaissement externe.
- Sur un essai SQL, la réponse `issued` contient uniquement le lien du canal demandé, **jamais** un repli automatique sur `generalLink`.
- Aucune ligne de paiement n'est confirmée et tous les nouveaux enregistrements fictifs sont annulés.

## Limites et points de blocage connus

- **Aucune base Supabase réelle n'a été consultée ou testée pendant la préparation de V5-C.28.** Sans paramètres et accès DEV, la compatibilité SQL effective demeure à confirmer. Les tests Node ne remplacent pas un contrôle SQL.
- Les URL du scénario sont **inventées pour les tests** (réservées à la validation de format) ; elles ne démontrent pas que Tara retourne ces formes exactes. En particulier, le validateur `cardLink` n'autorise actuellement que `https://taramoney.com/card/...` et doit être comparé à une vraie réponse fournisseur. `smsLink` peut ouvrir une messagerie SMS plutôt qu'un débit MTN/Orange.
- Le site React public n'est pas encore raccordé au serveur HTTP et celui-ci n'est pas monté/déployé. Les protections anti-robots et le rate-limit n'ont pas encore de fournisseurs réels.
- Les opérations de carte, dons et adhésions sans compte sont **limitées au périmètre en XAF** défini dans les lots précédents. Couples, cotisations complémentaires et EUR ne sont pas inclus.
- Aucune confirmation de paiement, affectation définitive, retenue de commissions ou admission n'est automatique à ce stade.

## Dossier fourni

- `scripts/v5c28-preflight.mjs`
- `scripts/v5c28-validate-local.sh`
- `tests/v5c28-preflight.test.mjs`
- `tests/sql/v5c28-catalogue-dev.sql`
- `tests/sql/v5c28-privileges-dev.sql`
- `tests/sql/v5c28-parcours-cinq-canaux-rollback.sql`

## Règle d'arrêt

**Si une migration n'est pas conforme ou si un contrôle SQL échoue, ne pas lancer d'appel Tara.** Conserver un état `pending` ou `manual_review`. L'enregistrement d'une commande ne constitue jamais la preuve d'un encaissement.
