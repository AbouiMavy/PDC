# PDC — V5-B.4 : tableau de bord national (prototype React isolé)

**Statut : DEVELOPPEMENT UNIQUEMENT — aucune donnée réelle, aucune livraison Vercel, aucun accès nominatif.**

## Compatibilité

- Projet PDC React/Vite, branche `feature/v5b`, versions récentes de Vite et React installées.
- Backend V5-B.3 opérationnel dans `backend/pdc-api` sur `127.0.0.1:8787`, relié à Supabase avec le compte PostgreSQL restreint.
- Le fichier privé `backend/pdc-api/.env` contient `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` et les secrets PostgreSQL. Ce correctif **ne copie ni n'affiche** les secrets de cette configuration.
- Les routes déjà disponibles dans le backend sont `GET /v1/admin/session` et `GET /v1/admin/dashboard`. Aucune mutation n'est ajoutée.

## Contenu du ZIP

1. `admin-dev.html` : point d'entrée HTML indépendant.
2. `vite.admin-dev.config.mjs` : serveur Vite sur **5175**, relais HTTP local vers 8787, lecture **exclusive** des deux valeurs publiques de configuration Supabase. Refuse explicitement un `vite build` avec cette config.
3. `src/features/admin-dev/` : tableau de bord React bilingue (FR/EN), authentification directe via Supabase Auth, session mémoire seulement, compteurs agrégés, déconnexion et rafraîchissement.
4. `tests/v5b4-admin-dev.test.mjs` : tests unitaires sans base réelle.

**Aucun** fichier `src/App.jsx`, `Navbar`, `main.jsx`, configuration Vite existante, SQL ou backend existant n'est remplacé.

## Installation

Depuis la racine `/workspaces/PDC`, dans Codespaces :

```bash
git switch feature/v5b
unzip -n pdc-v5b4-admin-dev.zip
node --test tests/v5b4-admin-dev.test.mjs
npm run build
```

La compilation normale du portail **ne doit pas** inclure `dist/admin-dev.html` :

```bash
test ! -e dist/admin-dev.html && echo "OK : admin-dev absent du build public"
```

Assure-toi que l'API est active dans un **premier terminal** :

```bash
cd /workspaces/PDC/backend/pdc-api
node --env-file=.env src/index.mjs
```

Si elle est déjà active, **ne relance pas de deuxième instance**.

Dans un **second terminal**, depuis la racine :

```bash
cd /workspaces/PDC
npx vite --config vite.admin-dev.config.mjs
```

Dans **Ports** de Codespaces, garde le port **5175 PRIVATE**. Ouvre son URL HTTPS puis ajoute `/admin-dev.html` ; ne publie jamais 5175.

## Tests fonctionnels

1. Sur `/admin-dev.html`, choisir FR ou EN et vérifier l'interface de connexion.
2. S'authentifier avec le compte fictif Supabase `pdc-v5b3-test@example.invalid` (mot de passe du compte test, **pas** le mot de passe PostgreSQL). Comme son rôle national a été révoqué, le résultat attendu est **Accès non autorisé** (HTTP 403), sans compteur.
3. L'action « Revérifier l'habilitation » doit rester refusée tant que le rôle n'a pas été rétabli. L'action « Changer de compte » efface le jeton en mémoire.
4. Une validation positive (200, compteurs) se fera seulement après une attribution **temporaire** contrôlée du rôle dans Supabase et une nouvelle révocation, dans une étape séparée.

## Sécurité / limites

- Les mots de passe et le jeton ne sont pas affichés ni enregistrés sur disque / localStorage. Le jeton reste en mémoire et disparaît au rechargement/à la déconnexion.
- Le mot de passe du compte fictif va **directement à Supabase Auth** en HTTPS. Le navigateur n'envoie au backend PDC que le jeton d'accès.
- Le fichier local `backend/pdc-api/.env` reste ignoré par Git ; Vite lit seulement l'URL publique de Supabase et la clé publishable. Aucune URL ou clé privée PostgreSQL n'est incluse dans le JavaScript envoyé au navigateur.
- Le tableau de bord lit seulement les compteurs agrégés autorisés par les fonctions `SECURITY DEFINER` déjà installées. Pas de listes nominatives ni de paiements.
- Le port **5175** doit rester privé dans GitHub Codespaces ; l'API écoute uniquement sur 127.0.0.1:8787. Le relais Vite permet d'appeler cette API sans l'exposer via un port public.
- Pas de MFA, de journal d'accès complet, de limitation de débit, de rotation des jetons ni de contrôle exhaustif : **ne pas utiliser avec des dossiers de militants réels**.
- Si le build normal de production contient `admin-dev.html`, ne pas le déployer et nous transmettre le résultat de la compilation.

## Vérification Git

```bash
git status --short
git check-ignore -v backend/pdc-api/.env
```

Seuls les nouveaux fichiers du ZIP peuvent être ajoutés au commit futur. Ne jamais committer les fichiers `.env`, ZIP ou sauvegardes.
