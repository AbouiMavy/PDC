# V5-B.1 — Contrôle et préparation de la base de développement

Cette livraison **ne remplace aucun fichier du portail** et **ne modifie aucune migration**. Elle ajoute un test SQL transactionnel à exécuter exclusivement sur un **nouveau projet Supabase de développement**.

## Conditions initiales
- Les tests JavaScript du socle V5-B ont réussi.
- La migration initiale `supabase/migrations/20261025000100_pdc_v5b_private_schema.sql` est présente dans le dépôt.
- Aucun formulaire n'envoie actuellement des données réelles au backend.
- Le projet Supabase de développement est créé et distinct de la production.

## Étape 1 — Vérifier le dépôt dans Codespaces

```bash
git switch dev-alexandre
git status --short
ls -l supabase/migrations/
node --test tests/registre-v5b.test.mjs tests/structure-v5b.test.mjs
npm run build
```

## Étape 2 — Initialiser la CLI Supabase sans Docker

```bash
npm install --save-dev supabase
npx supabase --version
# Exécuter uniquement si supabase/config.toml n'existe pas :
test -f supabase/config.toml || npx supabase init
```

L'initialisation ci-dessus n'envoie rien à la plateforme. **Ne pas exécuter `supabase start` dans Codespaces sans runtime Docker configuré.**

## Étape 3 — Créer un nouveau projet distant de développement

Sur https://supabase.com/dashboard, créer un projet nommé `pdc-developpement`, au sein d'une organisation contrôlée par le PDC. Choisir explicitement la région d'hébergement conformément aux obligations juridiques applicables ; si résidence des données dans l'UE requise, privilégier une région spécifique UE (Paris ou Francfort, par exemple). Utiliser un mot de passe robuste **sans le placer dans GitHub**.

Aucune donnée réelle, aucun militant réel, aucun paiement réel.

## Étape 4 — Connecter uniquement le projet de développement

Depuis Codespaces :

```bash
npx supabase login
npx supabase link --project-ref VOTRE_PROJECT_REF_DEV
npx supabase db push --dry-run
```

**STOP** à ce stade : conserver la sortie du `--dry-run` (en masquant les secrets), vérifier que le projet lié est bien celui de développement et que seule la migration V5-B attendue va être appliquée.

Ne pas exécuter `npx supabase db push` avant la revue de migration. Ne jamais utiliser `npx supabase db reset --linked` dans un environnement que l'on veut préserver.

## Étape 5 — Lorsque la migration aura été revue et appliquée

Dans le SQL Editor du *projet de développement exclusivement*, lancer `tests/sql/v5b-integration-test.sql`.

Le script vérifie : droits des rôles publics, distinction frais/cotisation, calcul du solde, double frais, dépassement, incohérence de devises, double événement. Il exécute `ROLLBACK` en fin de test, sans laisser de données fictives.

Aucune exécution SQL réelle n'a été effectuée lors de la préparation du paquet ; il faut donc examiner les résultats du moteur PostgreSQL avant de valider l'étape.

## Sécurité et gouvernance

Les adhésions à un parti politique et les dons nominaux peuvent révéler les opinions politiques. Une validation des finalités, bases juridiques, mentions d'information, durées de conservation et accès est indispensable avant la collecte réelle. Aucune clé `service_role` ou clé `sb_secret` ne doit être placée dans `VITE_*`, une page React, une archive partagée ou un commit Git.

## Critères de passage à la V5-B.2

1. Migration PostgreSQL appliquée en environnement de développement isolé ;
2. Sept tests SQL passés ;
3. Absence d'accès `anon`/`authenticated` au schéma privé ;
4. Procédure d'admission, de dédoublonnage et d'attribution des numéros militants définie ;
5. Plan des routes API et de l'authentification administrative validé.
