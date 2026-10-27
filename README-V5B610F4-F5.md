# PDC — Grande itération V5-B.6.10-F4 / F5

**Statut : candidate de développement, pas prête pour l'activation publique.**

Base exacte : branche `develop` après fusion PR n° 7, migrations `00100` à `01800`. Projet Supabase de **développement** : `rvgpnmznhzwlzqyefahd`. Les 18 fichiers de migration déjà appliqués **ne sont ni remplacés ni retouchés**.

## Livrable

1. **F4 / migration `20261027001900`** :
   - Nouveau prédicat privé `couple_photo_paid_v5b610f4(card,payment)` : rattache une demande de carte à l'un des deux adhérents *admis en F3*, à la commande F2 et au paiement unique de **4 000 centimes EUR** ; vérifie absence de remboursement/chargeback avéré.
   - `CREATE OR REPLACE` du prédicat interne E2 `applicant_photo_paid_single_v5b610e2` : **préserve la voie individuelle**, ajoute la voie couple et bloque les événements de remboursement vérifiés dans la voie individuelle.
   - Fonction privée `couple_photo_issue_pair_dev_v5b610f4` : émet **deux jetons différents** pour **deux demandes de carte distinctes** en une transaction atomique. Accepte deux empreintes SHA-256 seulement ; ne stocke jamais les jetons bruts.
   - Aucun `GRANT EXECUTE` à `anon`, `authenticated`, `service_role`, aux comptes lecture ou dépôt. Réservée au SQL Editor DEV / futur service de checkout privé **après revue indépendante de l'authentification**.
2. **F4 / module Node serveur** : génération de deux jetons cryptographiques, requête SQL paramétrée unique, validation stricte de deux réponses distinctes. **Pas de serveur HTTP, pas de secret, pas de nouvelle interface React.**
3. **F5 / préparation de la livraison** : workflow GitHub Actions qui teste les PR vers `develop` et `main` sans déploiement, et script de contrôle statique de release. Un résultat `PASS` ne vaut **pas** autorisation de mise en production.
4. **Tests** : 21 tests Node locaux réussis en copie isolée (17 F4 + 4 F5). Le script SQL F4 n'a **pas** été exécuté dans Supabase : sa réussite reste à établir par l'utilisateur.

## Limites explicites

- Ne crée **aucun** paiement Stripe/Tara, webhook ni session de paiement vérifiée. Les événements des scripts SQL sont fictifs et annulés par `ROLLBACK`.
- Ne crée **aucune** adhésion publique. Le portail `Adhesion.jsx` reste en mode simulation.
- Ne rend **pas** opérationnelle l'émission de jetons sur le portail. Le service ne doit pas retourner des jetons à un simple visiteur sur la base d'un UUID ou d'une référence de paiement ; contrôle de possession de session et consentements des deux bénéficiaires à ajouter.
- N'active **aucune** délivrance de cartes. Les modèles Cameroun/diaspora restent inchangés.
- La fonction `issue_pair` exige **deux demandes de carte**. Si un seul conjoint a sollicité une carte, aucune paire n'est émise ; son dossier peut être traité ultérieurement par le service individuel dans un flux habilité.
- La fonction E2/F1 de dépôt côté demandeur reste désactivée pour le public et ne doit pas être branchée directement sur Vercel.
- Les données d'appartenance à un parti politique sont sensibles : pas de test avec des noms, contacts, paiements ou photographies authentiques dans cet atelier.

## Installation non destructive dans Codespaces

À la racine `/workspaces/PDC`, sur la branche `feature/v5b`. D'abord synchroniser le dernier merge F3.1 si nécessaire :

```bash
cd /workspaces/PDC
git switch feature/v5b
git fetch origin
git merge --ff-only origin/develop
```

Si `--ff-only` échoue, **ne pas forcer** : comparer les historiques. Déposer l'archive à la racine, puis :

```bash
unzip -n pdc-v5b610f4-f5-grand-lot.zip
node --test backend/pdc-api/test/couple-portrait-grants-v5b610f4.test.mjs tests/v5b610f5-release-guard.test.mjs
(cd backend/pdc-api && npm test)
node --test tests/*.test.mjs
npm run build
node scripts/check-v5b-release-candidate.mjs
```

Attendu : **21 pass, 0 fail** pour les nouveaux tests. D'anciens tests de connexion en environnement réel peuvent afficher `skipped`, sans être considérés comme réussis. Le build Vite peut donner un avertissement de taille de paquet, non bloquant.

## Migration 01900 — contrôle avant application

```bash
cat supabase/.temp/project-ref
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

La référence doit être `rvgpnmznhzwlzqyefahd`, les anciennes migrations `00100` à `01800` alignées, et le **seul** fichier proposé doit être :

`20261027001900_pdc_v5b610f4_couple_portrait_grants_dev.sql`

**Ne pas lancer le véritable `db push` avant la validation du dry-run et des tests JavaScript.** Après validation, avec l'accord du responsable du projet :

```bash
npx supabase db push --linked
npx supabase migration list --linked
```

Attendu : **19 migrations locales et 19 distantes**.

Puis dans Supabase SQL Editor DEV, exécuter intégralement :

- `tests/sql/v5b610f4-couple-portrait-grants-test.sql` (12 contrôles ; finit par `ROLLBACK`).
- `tests/sql/v5b610e2-grants-test.sql` et `tests/sql/v5b610f1-applicant-gateway-test.sql` (non-régression du flux individuel).

**Attention :** un message `Success. No rows returned` prouve l'exécution complète seulement si le fichier SQL **entier** a été soumis, sans sélection partielle. Les tests de la migration F4 et du workflow doivent être validés avant tout commit vers les branches d'intégration.

## Git : consolider dans `develop`

```bash
git add \
  README-V5B610F4-F5.md \
  supabase/migrations/20261027001900_pdc_v5b610f4_couple_portrait_grants_dev.sql \
  tests/sql/v5b610f4-couple-portrait-grants-test.sql \
  backend/pdc-api/src/couple-portrait-grants-v5b610f4.mjs \
  backend/pdc-api/test/couple-portrait-grants-v5b610f4.test.mjs \
  scripts/check-v5b-release-candidate.mjs \
  tests/v5b610f5-release-guard.test.mjs \
  .github/workflows/pdc-v5b-validation.yml

git diff --cached --check
git diff --cached --stat
git diff --cached --name-only | grep -E '\.env$|\.pem$|\.key$|\.p12$|\.zip$' \
  && echo 'ATTENTION : fichier sensible détecté' \
  || echo 'OK : aucun fichier de ces types détecté'
```

Seulement après validation SQL :

```bash
git commit -m 'feat: PDC V5B610F4-F5 couple photo grants et controle release'
git push origin feature/v5b
```

PR **base `develop`**, **compare `feature/v5b`**. Vérifier les checks CI, puis fusionner. Laisser `main` inchangée à ce stade.

## Vers `main` — étape finale de l'itération, conditionnelle

`main` et `develop` ont **des commits divergents** ; une fusion directe sans vérification n'est pas appropriée. La cible est une **PR de release vers `main`**, après :

1. Confirmation des 19 migrations DEV et des tests SQL F4 / E2 / F1, sans données réelles.
2. CI GitHub au vert, contrôle des secrets dans le **contenu**, revue des accès `SECURITY DEFINER` et des politiques Storage (ne pas confondre tests unitaires et audit).
3. Vérification Vercel des branches de production et prévisualisation (au moins quatre projets ont émis des checks dans une itération précédente), et contrôle qu'aucune page admin de développement ni endpoint photo ne devient publiquement accessible.
4. Test fonctionnel de la navigation FR/EN, des dons et adhésions **en simulation**, avec preuve que les fonctions réelles restent **désactivées**.
5. Examen du diff `origin/main...origin/develop`, résolution des éventuels conflits dans une **branche de release**, puis nouvelle exécution des tests sur la branche de release.

**Fusionner du code sur `main` ne signifie pas activer l'adhésion réelle.** Tant que les exigences précédentes ne sont pas remplies, ne pas déclencher la PR finale. Aucun `git push --force`, `db reset` ni copie de secrets dans Git.
