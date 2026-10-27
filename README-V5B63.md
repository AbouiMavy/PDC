# PDC V5-B.6.3 — Revue hebdomadaire et révocation (développement)

**Branche de travail : `feature/v5b`. Projet Supabase : `rvgpnmznhzwlzqyefahd` uniquement.**

La migration `20261025000800_pdc_v5b63_weekly_review_dev.sql` complète les **sept** migrations déjà appliquées, sans modifier les anciennes tables, paiements, numéros ni formulaires React. Aucune donnée réelle n'est attendue dans ce projet.

## Logique métier

1. L'adhésion Internet issue de V5-B.6.2 est **enregistrée** avec un numéro unique et `memberships.status='active'`, `verified_at=NULL`.
2. Un administrateur national ouvre un **lot de contrôle** avec `open_weekly_review_dev(actor_uuid)` : la liste des adhérents actifs non encore contrôlés est figée. **Un seul lot ouvert à la fois.**
3. `list_weekly_review_dev(actor_uuid,batch_uuid)` retourne les personnes du lot et l'information éventuelle de demande de carte (pas de photo enregistrée ni exposée).
4. Un dossier problématique peut être révoqué via `revoke_internet_membership_dev(actor_uuid,membership_uuid,'motif ...')`. La révocation marque `memberships.status='ended'`, trace auteur et motif, et invalide une demande de carte ; elle **ne supprime ni le numéro ni les paiements**.
5. `close_weekly_review_dev(actor_uuid,batch_uuid)` marque collectivement `verified_at` pour les adhérents non révoqués du lot, et les demandes de carte concernées passent à `reviewed` **sans émission, impression ni délivrance**.
6. Les nouvelles adhésions reçues après l'ouverture du lot seront reprises lors du prochain cycle.

**Important :** `verified_at` signifie « contrôle administratif effectué ». Ce champ ne signifie pas « carte délivrée » ni « adhésion définitivement acquise » ; le caractère définitif d'une adhésion sans carte reste à arbitrer puisque la carte est facultative.

## Sécurité

- Fonctions `SECURITY INVOKER`, **aucun privilège d'exécution** pour `anon`, `authenticated`, `service_role`, ni le rôle de l'API existante. Elles sont destinées **uniquement au SQL Editor du projet de développement**, jusqu'à création d'une API d'administration en écriture explicitement authentifiée et autorisée.
- Rôle `national_admin` actif requis, revérifié dans la base.
- Les deux nouvelles tables sont en schéma privé et ont la RLS activée ; aucun droit d'accès n'est accordé au navigateur.
- Toutes les opérations administratives sont auditées et aucune carte numérique n'est générée.
- Les tests créent uniquement des personnes fictives et s'achèvent par `ROLLBACK` : aucun numéro n'est consommé.

## Installation dans Codespaces

```bash
cd /workspaces/PDC
git switch feature/v5b
unzip -o pdc-v5b63-revue-hebdomadaire-dev.zip
node --test tests/v5b63-weekly-review.test.mjs
cat supabase/.temp/project-ref
npx supabase db push --linked --dry-run
```

Attendu : `rvgpnmznhzwlzqyefahd`, puis seulement `20261025000800_pdc_v5b63_weekly_review_dev.sql` dans le dry-run.

**Ne pas appliquer la migration avant de vérifier cette liste.** Après validation, appliquer de manière contrôlée via `npx supabase db push --linked`, puis exécuter intégralement `tests/sql/v5b63-weekly-review-test.sql` dans Supabase SQL Editor. L'utilisateur de test `pdc-v5b3-test@example.invalid` doit exister dans Supabase Auth (comme pour V5-B.5). Attendu : dix notices de contrôle et `Success. No rows returned`.

## À ne pas faire

- Ne pas utiliser `db reset`, `--include-all`, ni la production.
- Ne pas exécuter ces fonctions avec des identifiants réels ou des données de militants.
- Ne pas donner de droit `EXECUTE` au rôle API tant qu'une API sécurisée **avec vérification effective des JWT** n'est pas réalisée.
- Ne pas exposer des photos, listes de membres ou numéros via une URL publique.

## Étapes restant à développer

Interface nationale sécurisée (liste et clôture des lots, revocations) ; raccordement aux paiements Tara/Stripe ; adhésion de couple ; stockage privé des portraits ; génération de cartes et délivrance tracée ; consolidation du formulaire civilité sans champ « Sexe » affiché.
