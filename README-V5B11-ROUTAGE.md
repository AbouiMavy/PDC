# V5-B.11 — Recette consolidée du routage public PDC

## Objectif et périmètre

Correctif NON destructif : un seul lot pour les routes publiques, les refus d'accès expérimentaux, les régressions iPhone et la recette HTTP de `pdc-portail`. Aucune modification des règles métier, des paiements, des données Supabase ou des modèles de cartes.

## Livrables

- `vercel.json` : règles explicites pour les **six chemins publics** du routeur React. La racine `/` est déjà servie par `index.html`.
- `tests/v5b11-public-routing.test.mjs` : vérification hors ligne de l'accord entre les routes React et les rewrites, des exclusions de sécurité et du correctif Safari iPhone.
- `scripts/check-pdc-public-routes.mjs` : recette HTTP non destructive après fusion, sur le domaine public du PDC.

## Pourquoi pas un catch-all ?

Le classique `/(.*) -> /index.html` rendrait possible l'affichage de la page React sous `/admin-dev.html`, `/carte-dev.html` et `/__pdc_admin_api/...` avec statut HTTP `200` au lieu d'un vrai `404`. La règle exacte évite cette confusion et n'affecte pas `/assets/`, `/documents/` ni les images.

Les rewrites ne remplacent en aucun cas une authentification ou une autorisation côté serveur. L'espace `/mon-espace` reste **une démonstration statique et publique** : aucun accès réel au dossier personnel ni à un solde de cotisation.

## Application en branche dédiée, depuis Codespaces

1. Créer un worktree indépendant depuis `origin/main` (ne pas écraser le dossier `/workspaces/PDC` et ne pas réutiliser une branche déjà ouverte).
2. Vérifier qu'aucun `vercel.json` n'existe déjà et que `git status --short` est vide.
3. Appliquer le fichier `.patch` avec `git apply --check` puis `git apply`.
4. Exécuter :

```bash
npm ci
npm ci --prefix backend/pdc-api
node --test tests/*.test.mjs
npm test --prefix backend/pdc-api
npm run build
node scripts/check-v5b-release-candidate.mjs
git diff --check
```

5. Commit et Pull Request vers `main`, vérifier GitHub Actions, faire examiner le diff. Étant donné la restriction de preview Vercel par le propriétaire, valider la configuration hors ligne et le risque de routage avant de fusionner. Ne pas inclure l'archive `.patch` dans le commit.

## Recette après déploiement Vercel

Sur l'adresse de production `pdc-portail.vercel.app` :

```bash
node scripts/check-pdc-public-routes.mjs
```

Attendu : pages publiques `200` avec vrai `index.html` Vite ; 4 chemins administratifs/DEV `404` (dont deux routes API). Le script ne modifie aucune donnée ni aucun paiement.

Vérifier aussi **dans Safari sur iPhone** : `/adhesion`, formule couple, `/soutenir`, portrait/paysage, calendrier natif. Les tests automatisés ne remplacent pas ces essais.

## Limites et contrôles préalables

- Ce lot n'active pas le renouvellement réel, le paiement ou les émissions de cartes. La V5-C fera l'objet d'un lot séparé.
- Tous les projets Vercel liés à `main` peuvent être redéployés après fusion. Le contrôle prioritaire porte sur `pdc-portail`.
- Si un autre développeur ajoute une route dans `src/App.jsx`, le test refusera le lot jusqu'à ce que `vercel.json` ait été actualisé.
- Le programme `vite preview` en Codespaces vérifie le SPA et les CSS, mais **ne reproduit pas** les règles du CDN Vercel. Seule une vérification du domaine après déploiement conclut sur les statuts HTTP réels.
