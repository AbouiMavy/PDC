# PDC — V5-B.3 : API nationale en lecture seule (prototype de développement)

**Statut : expérimental. Aucun accès à de vrais dossiers ; aucune ouverture Internet ; aucun déploiement Vercel.**

## Ce qui est inclus

- Nouvelle migration `20261025000300_pdc_v5b3_api_readonly.sql` **additive**, sans modifier les migrations V5-B.1 et V5-B.2 déjà appliquées.
- Groupe SQL `pdc_api_v5b3` **NOLOGIN** ; aucun mot de passe dans les migrations et aucun privilège direct sur les tables sensibles.
- Deux fonctions privées `SECURITY DEFINER` à `search_path=''` : vérification d'habilitation `national_admin` et compteurs agrégés ; l'exécution est interdite à `PUBLIC`, `anon`, `authenticated`, `service_role` et autorisée exclusivement au groupe dédié. Une validation d'habilitation est réitérée dans le tableau de bord.
- API autonome `backend/pdc-api/` (Node ≥20.12) ; **aucun changement de React** ni du `package.json` racine.
- Routes : `GET /health`, `GET /v1/admin/session`, `GET /v1/admin/dashboard`. Aucune écriture, aucun endpoint d'admission dans cette version.
- Authentification par `GET /auth/v1/user` du projet Supabase avec jeton `Bearer` vérifié par le service Auth. Le `user.id` provient **uniquement de la réponse Auth**, jamais d'un champ fourni par le navigateur.
- Connexion PostgreSQL seulement après création **séparée** d'un rôle `LOGIN` technique auquel on accorde `pdc_api_v5b3` ; TLS avec validation du certificat (fichier CA), refus explicite des comptes `postgres` et `service_role`.
- Tests Node sans connexion aux données ; tests SQL en transaction `ROLLBACK`.

## 1. Installation sans mutation distante

Sur `feature/v5b`, déposer le ZIP à la racine puis :

```bash
unzip -n pdc-v5b3-api-readonly.zip
cd backend/pdc-api
npm install
npm audit
npm test
cd ../..
node --test tests/*.test.mjs
npm run build
```

**Ne publie pas les ZIP, les secrets `.env` ou les sauvegardes dans Git.** Pour commencer, seules les vérifications locales sont nécessaires.

## 2. Examiner la migration SQL — arrêt pour validation

```bash
cat supabase/.temp/project-ref
npx supabase db push --linked --dry-run
```

Projet attendu : `pdc-developpement`, référence `rvgpnmznhzwlzqyefahd`.

Migration attendue **uniquement** : `20261025000300_pdc_v5b3_api_readonly.sql`.

**ARRÊT ICI : communiquer le résultat du dry-run avant d'exécuter la migration réelle.**

Après validation et application distincte, lancer `tests/sql/v5b3-rights-test.sql` dans le SQL Editor du projet de développement. Le résultat attendu est « Success. No rows returned ». Il vérifie les privilèges et le refus d'un administrateur inconnu, sans produire de données fictives.

## 3. Démarrage API : volontairement désactivé à ce stade

Le serveur refusera de démarrer tant que `PDC_API_ENABLE_DB` n'est pas `true` et qu'aucun compte SQL technique **restreint** + CA TLS valide n'est configuré. C'est intentionnel. Ne pas utiliser le compte PostgreSQL `postgres` ni une clé `service_role`.

Lors d'une étape ultérieure, l'administrateur créera un `LOGIN` PostgreSQL dédié avec un mot de passe fort conservé hors Git. Ce compte n'héritera que de `pdc_api_v5b3`. Ne pas introduire de secret dans le SQL Editor enregistré, dans une Pull Request ou ici dans le chat.

Les variables d'exemple sont dans `backend/pdc-api/.env.example`. **Ce fichier n'est pas une configuration exécutable.**

Supabase Auth est distinct de la Data API : le service d'authentification peut vérifier un JWT même lorsque la Data API est désactivée. Le backend utilisera une connexion PostgreSQL chiffrée, avec vérification du certificat. Pour un service persistant IPv4, préférer le pooler *session* ; pour un service serverless, le pooler *transaction* avec les restrictions correspondantes. L'API n'est pas destinée à être exposée publiquement dans cette phase.

## 4. Sécurité et limites connues

- Les fonctions `SECURITY DEFINER` sont propriétaires de données privilégiées : leur code et leurs `GRANT` doivent être revus avant la production.
- Aucun filtrage territorial ni consultation de fiches nominatives n'est encore autorisé.
- L'identification via jeton est vérifiée auprès de Supabase Auth ; les habilitations administratives sont vérifiées en base **à chaque requête**.
- La fonction d'admission V5-B.2 reste expérimentale et **n'est pas appelée par ce serveur**.
- Aucun mécanisme MFA, rotation des identifiants, journalisation des accès et limitation distribuée de débit n'a encore été validé. L'API ne doit **pas** être ouverte sur Internet ni contenir de données réelles.
- CORS n'est pas une barrière de sécurité ; les jetons, les rôles SQL et les restrictions réseau restent déterminants.
- Ne jamais faire d'attribution de rôle national depuis un formulaire ou à partir d'un identifiant transmis par le navigateur.

## 5. Préparation du futur commit

Sur `feature/v5b`, une fois les contrôles réussis :

```bash
git add backend/pdc-api/package.json backend/pdc-api/src/ backend/pdc-api/test/ backend/pdc-api/.env.example backend/pdc-api/.gitignore README-V5B3.md supabase/migrations/20261025000300_pdc_v5b3_api_readonly.sql tests/sql/v5b3-rights-test.sql
# Si npm install a produit backend/pdc-api/package-lock.json, l'ajouter aussi.
git diff --cached --check
git diff --cached --stat
```

Ne pas inclure les `.pdc-*`, ZIP ou `.env` secrets. Conserver les modifications uniquement dans `feature/v5b`.
