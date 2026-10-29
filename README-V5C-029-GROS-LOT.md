# V5-C.29 — Raccordement contrôlé Adhérer / Soutenir, protections, historique

**Base ciblée :** `AbouiMavy/PDC`, branche `feature/v5c`, commit de référence `6f7d01a`.

**Statut : préparation intégrable et testable localement.** Ni déploiement, ni confirmation de paiement, ni mise en production. Ne pas interpréter ce lot comme l'activation des paiements en ligne.

## Fonctionnalités livrées

- Raccordement des deux pages de récapitulatif au POST `/v1/public/orders`, sans compte militant, **désactivé par défaut** par deux interrupteurs explicites Vite.
- Conservation de la même référence d'idempotence côté navigateur pendant toute la tentative. Après erreur réseau ou délai dépassé, aucun renvoi automatique : **revue humaine**.
- Création du payload compatible avec `preparePublicOrderRequest()` ; les frais initiaux de première adhésion CM restent fixés à **2 000 XAF côté serveur**. Les dons directs portent leur montant brut, sans majoration pour commissions.
- Répartition des dons en points de base à 100,00 % avec algorithme déterministe, sans arrondi financier JS ni perte silencieuse.
- Protection des parcours non couverts : pas de don mensuel réel, pas d'anonymat public non enregistré, pas de carte/photo ni cotisation simultanée, ni couple/diaspora au tarif de 2 000 XAF.
- Affichage d'un lien **uniquement si** le backend retourne `issued` et le champ propre au canal (`smsLink`, `whatsappLink`, `telegramLink`, `dikaloLink`, `cardLink`) ; refus de la substitution d'un `generalLink`.
- Composant Turnstile client, vérification de l'action et du hostname **côté serveur**, statut fail closed.
- Limiteur partagé PostgreSQL avec clé HMAC, role `pdc_tara_v5c_writer`, RPC atomique, RLS et migration **029** non appliquée automatiquement.
- Composition serveur DEV isolée, sans `listen()` automatique. L'ancien serveur national en lecture seule est préservé.
- Audit de l'historique Supabase **022/023/027/029 en lecture seule**, sans `migration repair` automatique.

## Installation dans Codespaces

Déposer l'archive ZIP à la racine de `/workspaces/PDC-v5c` :

```bash
cd /workspaces/PDC-v5c
unzip -n PDC_V5C_029_raccordement_securise.zip
python3 scripts/apply-v5c29-frontend.py
bash scripts/v5c29-validate-local.sh
```

Le script refuse de modifier la source si la base attendue ne correspond pas, **avant de toucher à un fichier**. En cas de conflit, ne pas forcer une substitution.

## Configuration et activation DEV séparées

Le fichier `.env.v5c29.example` est un exemple **public sans secret**, initialement désactivé. Un test UI actif nécessite :

1. Une API DEV **HTTPS** sur un domaine approuvé dans `allowedOrigins` (pas d'accès direct depuis le navigateur aux tables privées) ; configuration de l'origine exacte dans Vite.
2. Le rôle `pdc_tara_v5c_writer` effectivement provisionné de manière sécurisée par l'administrateur DEV (021 le crée **sans mot de passe**). Les adaptateurs PostgreSQL refusent `postgres` et `service_role`.
3. L'application contrôlée de la migration 029 sur **Supabase DEV** puis `tests/sql/v5c29-rate-limit-rollback.sql`, après vérification des migrations précédentes. Le script ne persiste pas de fausses opérations : `ROLLBACK`.
4. Une clé de site Turnstile côté **Vite** et le **secret Turnstile uniquement côté serveur**. L'action doit être `pdc-public-order`, le hostname exact doit correspondre. La politique CSP doit autoriser les ressources Turnstile nécessaires.
5. L'assemblage `composeProtectedPublicSandboxV5C29` ne démarre **aucun** listener. Le démarrage réseau est une décision distincte ; la connexion dans un reverse proxy exige une étude de la vraie adresse IP, sinon tous les visiteurs partageraient un même bucket de débit.
6. `issueLinks=false` au départ : les commandes peuvent être enregistrées/réservées en DEV mais **aucun lien payable créé par erreur**. Passer à `issueLinks=true` seulement lorsque Tara confirme que les identifiants sont de sandbox et après examen des URL réelles de `cardLink` et `smsLink` (ce dernier peut n'être qu'un lien de partage SMS).
7. Les vrais documents d'adhésion et la notice de confidentialité doivent être approuvés avant les parcours de production ; l'application financière reste `draft` par conception.

Ne jamais placer `apiKey`, le mot de passe PostgreSQL, le secret CAPTCHA ou une clé `service_role` dans `VITE_*`, `src/`, Git ou une requête utilisateur.

## Historique Supabase

Les migrations 023 et 027 ont été exécutées par SQL Editor et **ne sont pas forcément inscrites** dans `supabase_migrations.schema_migrations` ; 022 nécessite son propre audit. Exécuter uniquement :

```text
tests/sql/v5c29-migration-history-readonly.sql
```

Ne jamais réexécuter 023/027 ni lancer `supabase db push` avant réconciliation des versions. Ne pas marquer 022 ou 029 « applied » si les objets n'existent pas. Une commande de réparation, si nécessaire, doit être décidée après examen de la base réelle et de l'historique.

## Limites restantes (V5-C.30)

- Aucun moyen de paiement n'est **confirmé** par `issued`, par un retour navigateur ou par un webhook Tara ; rapprochement financier réel et vérification de son API encore nécessaires.
- Les formulaires ne téléchargent pas encore les photos et la demande de carte n'est pas persistée par 023.
- La table 023 ne persiste pas la commune, la périodicité mensuelle ni le statut d'anonymat public des dons : ces parcours restent hors périmètre de ce raccordement.
- Aucune mise en production ni activation d'un endpoint Internet depuis ce lot.

**Critère de livraison :** tests et build validés sur le vrai dépôt, puis essais DEV SQL/HTTP séparés. Aucune modification de paiements réels dans ce lot.
