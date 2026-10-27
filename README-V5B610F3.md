# PDC — V5-B.6.10-F3 : admission transactionnelle de couple (DEV uniquement)

**Lot additif : 5 fichiers nouveaux, aucune modification des migrations 00100–01600 ni du portail React.**

## Situation de départ

- Branche de travail : `feature/v5b`, intégration ultérieure dans `develop`. **Ne pas modifier `main`.**
- Base liée de développement : `pdc-developpement` (`rvgpnmznhzwlzqyefahd`), **16 migrations** déjà appliquées et vérifiées (F2 = `20261026001600`).
- F2 représente un couple comme **une commande de 40 EUR (4 000 centimes)**, un paiement du payeur et **deux demandes individuelles** (`member` / `partner`). Il interdit les doubles allocations financières.
- L'ancienne fonction `admit_paid_internet_dev` refuse les couples : **elle n'est pas modifiée**. F3 crée une procédure dédiée, `pdc_private.admit_paid_couple_dev_v5b610f3(uuid)`.

## Ce que F3 réalise

1. Vérifie le paiement F2 (4 000 centimes, statut confirmé, événement prestataire marqué comme vérifié ; aucun événement de remboursement/litige vérifié).
2. Verrouille la commande, le paiement, les demandes et les personnes ; contrôle l'identité, les deux consentements, l'état des demandes, la civilité et les informations de naissance.
3. Admet **les deux personnes dans une même instruction PostgreSQL**. Un échec annule les deux insertions et la progression du compteur.
4. Utilise le compteur national transactionnel `internet_member_counter_v5b62` partagé avec l'admission individuelle ; émet deux numéros `M-PDC-I-xxxxxx` ou `F-PDC-I-xxxxxx` distincts (un numéro par personne), jamais deux numéros pour un même rang.
5. Enregistre un seul événement d'admission du couple et un registre privé `couple_admissions_v5b610f3` ; autorise une relecture idempotente si les deux dossiers restent cohérents et si la preuve financière est encore valable.
6. Inscrit, si elles sont demandées, deux demandes de carte privées, sans photo ni délivrance. Les membres restent à `verified_at = NULL` en attente de la revue administrative prévue par les versions précédentes.
7. **N'ajoute aucun paiement, aucune affectation de 20 EUR et aucune cotisation individuelle fictive.** La transaction de 40 EUR reste l'unité financière.

## Limites et contrôles non activés

- Pas d'enregistrement public des personnes et demandes depuis React. Pas de serveur de checkout, de webhook réel, de création d'autorisations photographiques ni de paiement réel.
- La fonction F3 est `SECURITY INVOKER` et **n'accorde aucun `EXECUTE`** aux rôles `anon`, `authenticated`, `service_role`, API lecture seule ou upload. Exécution uniquement sous rôle de confiance depuis le SQL Editor du projet DEV, avec données fictives.
- Le champ `payment_events.verified_at` est **une preuve déclarative produite par un futur backend**. Le SQL ne vérifie aucune signature TaraMoney/Stripe. Un scénario de test qui insère directement ce champ n'est **pas** une preuve bancaire réelle.
- Après une admission déjà réalisée, le remboursement interdit de réutiliser la preuve mais **ne suspend pas rétroactivement les adhésions**. Le traitement des rétrofacturations, suspensions, corrections financières et recours reste à développer.
- La simultanéité avec des webhooks réels n'est pas validée : le backend de paiement devra sérialiser toute mutation d'état et événement financier sur le paiement, avec audit/idempotence. Avant une activation publique, revoir les droits SQL, l'isolation transactionnelle, la confidentialité de l'appartenance politique et les règles RGPD.
- La fonction E2 d'émission des jetons photo refuse encore explicitement `category_code='couple'`. Ne pas l'ouvrir par simple suppression du filtre ; ce sera une autre livraison avec deux droits d'accès individuels sécurisés.

## Installer **uniquement** les nouveaux fichiers

Télécharger l'archive dans `/workspaces/PDC` puis :

```bash
cd /workspaces/PDC
git switch feature/v5b
git status --short
unzip -n pdc-v5b610f3-admission-couple.zip
```

`unzip -n` n'écrase pas les fichiers suivis. Les sauvegardes et ZIP restent hors Git.

### Étape A — tests JavaScript / compilation locale

```bash
node --test backend/pdc-api/test/couple-admission-v5b610f3.test.mjs
(cd backend/pdc-api && npm test)
node --test tests/*.test.mjs
npm run build
```

Attendu pour le nouveau fichier : **16 tests réussis**, aucun échec. Les tests structurels JavaScript **ne remplacent pas** les tests SQL sur PostgreSQL.

### Étape B — vérifier **sans application**

```bash
cat supabase/.temp/project-ref
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Vérifier `rvgpnmznhzwlzqyefahd`. Le `dry-run` doit proposer **uniquement** :

`20261026001700_pdc_v5b610f3_couple_admission_dev.sql`

**Ne pas lancer `db push` tant que le résultat des tests et du `dry-run` n'a pas été revu.** Ne jamais utiliser `supabase db reset` ici.

### Étape C — après validation du dry-run

```bash
npx supabase db push --linked
npx supabase migration list --linked
```

Attendu : **17 migrations locales / 17 distantes**, concordantes. Puis exécuter **intégralement** `tests/sql/v5b610f3-couple-admission-test.sql` dans le SQL Editor du projet de **développement**. Les **12 contrôles** doivent s'achever par `Success. No rows returned` et les notices correspondantes. Le script est encadré par `BEGIN; ... ROLLBACK;` : aucun membre, paiement ni numéro fictif ne persiste.

## Versionnement, uniquement après validation de la base

```bash
git add \
  README-V5B610F3.md \
  supabase/migrations/20261026001700_pdc_v5b610f3_couple_admission_dev.sql \
  backend/pdc-api/src/couple-admission-contract-v5b610f3.mjs \
  backend/pdc-api/test/couple-admission-v5b610f3.test.mjs \
  tests/sql/v5b610f3-couple-admission-test.sql

git diff --cached --check && echo 'OK : aucune erreur de formatage'
git diff --cached --name-only | wc -l
```

Attendu : **5 fichiers**. Vérifier absence de secrets, puis commit/push `feature/v5b` et PR `base: develop`, `compare: feature/v5b`, une fois les tests SQL terminés.

## Prochain périmètre

**F4** : rattachement des deux autorisations photographiques à la commande payée, chacun à son `card_request_id`, sans donner au membre ou partenaire un droit d'accès au dossier de l'autre. Le chantier de soumission publique, de preuve de possession de la session de paiement et de webhook signé demeure distinct et préalable à toute ouverture du portail réel.
