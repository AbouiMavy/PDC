# PDC — V5-B.6.2 : admission Internet et numérotation (développement)

**Branche : `feature/v5b` uniquement. Projet Supabase de développement : référence `rvgpnmznhzwlzqyefahd`.**

## Avancement

- Migration **additive** `20261025000700_pdc_v5b62_internet_admission_dev.sql` (prérequis : V5-B.1 à V5-B.6.1 appliquées).
- Fonction PostgreSQL **privée** `pdc_private.admit_paid_internet_dev(uuid)` destinée à un futur appel exclusivement serveur, après vérification d'un paiement.
- Le numéro **`M-PDC-I-000001` / `F-PDC-I-000002`** est dérivé de **Monsieur/Madame** ; aucune saisie autonome du sexe n'est nécessaire à l'admission serveur. **Le formulaire React installé n'est pas encore corrigé** : nous attendons la consolidation des remarques du test visuel.
- Numéro à **six positions numériques** et **compteur national unique**, partagé entre M/F ; réservation définitive par personne ; un numéro n'est jamais réattribué. L'ancien registre reste intact.
- **Compteur transactionnel** avec verrouillage SQL : dans `ROLLBACK` il revient à sa valeur antérieure. La séquence préparatoire installée en V5-B.6.1 reste privée et inutilisée.
- Retentative idempotente ; refus d'une deuxième admission pour la même personne ; création d'une demande de carte uniquement si option cochée ; pas de carte générée.
- `memberships.status='active'` indique l'enregistrement ; `verified_at=NULL` signifie que la revue hebdomadaire n'a pas été effectuée. Ne pas interpréter `active` comme une délivrance définitive de carte.
- Les empreintes de photos ne sont pas stockées et aucune page de paiement n'est connectée.

## Adhésions prises en charge *par cette procédure expérimentale*

| Cas | Règle comptable | Statut |
|---|---|---|
| Cameroun | Obligation de frais initiaux **2 000 XAF** liée à la demande, intégralement réglée | Préparé |
| Diaspora individuel | Cotisation annuelle **30 EUR = 3 000 centimes** liée à la demande, intégralement réglée | Préparé |
| Diaspora réduit | Cotisation annuelle **15 EUR = 1 500 centimes** liée à la demande, intégralement réglée | Préparé |
| Diaspora couple | **40 EUR pour deux personnes** : répartition comptable conjointe non encore définie | **Volontairement bloqué dans cette version** |
| Virement ou règlement manuel | Vérification humaine et circuit de rapprochement encore à définir | Pas d'admission automatique ici |

La procédure exige une tentative `confirmed` affectée à l'obligation du dossier, avec référence prestataire (`tara` / `stripe`) et événement possédant `verified_at`. **`verified_at` n'est pas en soi une preuve cryptographique** : une API sécurisée devra vérifier réellement les événements avant de renseigner le registre. **Ne jamais faire entrer de vraies adhésions avec ce code de développement.**

## Pourquoi une nouvelle table compteur alors que V5-B.6.1 avait créé une séquence ?

`nextval()` n'est pas annulé par `ROLLBACK` : un test réussi consommerait de vrais rangs. Nous avons donc retenu un compteur protégé par `UPDATE ... RETURNING` sur **une seule ligne**, transactionnel. L'unicité est également garantie par les contraintes `UNIQUE` existantes. Le contrôle final de la numérotation historique avant activation reste nécessaire.

## Installation sans écraser le formulaire ni l'API

Depuis Codespaces :

```bash
cd /workspaces/PDC
git switch feature/v5b
unzip -o pdc-v5b62-admission-internet-dev.zip
node --test tests/v5b62-internet-admission.test.mjs
cat supabase/.temp/project-ref
npx supabase db push --linked --dry-run
```

La commande `cat` doit afficher `rvgpnmznhzwlzqyefahd`. **Le `--dry-run` doit proposer une seule migration : `20261025000700_pdc_v5b62_internet_admission_dev.sql`.**

**Ne pas appliquer la migration sans vérifier ce résultat.** Ne jamais utiliser `db reset`, `--include-all` ou modifier `main`/la production.

Après application contrôlée dans le projet de développement :

```bash
npx supabase migration list --linked
```

Copier **tout le contenu** de `tests/sql/v5b62-internet-admission-test.sql` dans Supabase SQL Editor et exécuter. Il se termine par `ROLLBACK`. Résultat attendu : `Success. No rows returned`, avec les notices `1/10` à `10/10` ; le compteur ne bouge pas après l'annulation.

### Important — tests disponibles

Les 6 tests `node --test` vérifient structure, permissions déclarées et invariants dans le fichier SQL, **pas** une exécution PostgreSQL. Seul le test SQL Editor confirme le comportement réel ; il n'a pas été exécuté dans l'environnement de création de ce ZIP.

## Étapes suivantes (non incluses)

1. Consolider les remarques du formulaire, notamment **supprimer les listes « Sexe » et inférer M/F exclusivement depuis les civilités** ; conserver le lieu de naissance obligatoire uniquement pour les adhésions.
2. Créer un processus serveur de vérification des paiements Tara/Stripe ; n'activer l'admission automatique que lorsque les signatures/états sont effectivement vérifiés et les écritures protégées.
3. Modéliser l'adhésion de **couple à deux dossiers / un paiement**, sans inventer de ventilation comptable arbitraire.
4. Mettre en place revue hebdomadaire, révocations tracées, téléversement privé des photos et cartes numériques/physiques.
5. Régler la notion d'adhésion définitive en l'absence de carte, puisque la carte est facultative.
