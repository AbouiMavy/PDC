# PDC — V5-C.27 : clôture technique de la journée (DEV, pas de déploiement)

## Portée exacte

**Ajout :** un parcours d'émission Tara **par canal** au-dessus des commandes publiques V5-C.23–26, conçu pour fonctionner après une réservation SQL privée.

| Choix dans Adhérer / Soutenir | Champ conservé | Sortie |
| --- | --- | --- |
| Mobile Money | `smsLink` | lien SMS/partage, **pas preuve d'un accès direct MTN/Orange** |
| Tara / WhatsApp | `whatsappLink` | WhatsApp |
| Tara / Telegram | `telegramLink` | Telegram |
| Tara / Dikalo | `dikaloLink` | Dikalo |
| Carte bancaire via Tara | `cardLink` | lien carte |
| Virement | aucun | hors Tara, sans émission |

**Jamais de repli vers `generalLink`.** Le lien général est conservé dans le champ historique privé de l'intention, non retourné au navigateur. Le champ, le mode, le sous-canal et l'URL sélectionnés sont conservés atomiquement dans l'intention Tara via la nouvelle RPC DEV.

### Effets & protections

- D'abord `orders.create()` (identité, contribution brute et allocation SQL), puis `taraReservations.reserveCheckout()` (produit stable), **puis seulement** `claimLinkRequest()` et `createPaymentLink()` si `issueLinks: true` dans le serveur DEV.
- Une seconde requête avec la même clé d'idempotence et un lien déjà `issued` recharge seulement le lien sélectionné depuis la base ; **0 deuxième appel au fournisseur**.
- Si le lien demandé manque, si le prestataire répond après un timeout, si la sauvegarde échoue ou si un état est `unknown` / `requested`, la réponse est `manual_review` **sans nouveau paiement**.
- Le backend refuse une URL externe suspecte et ne transmet au navigateur que `paymentUrl`, `linkField`, `productId`, `paymentId`, `grossAmountXaf`, la devise et des indicateurs `false`.
- Aucune clé Tara, aucun identifiant SQL, aucun mot de passe, aucun `generalLink` dans la réponse publique.
- Aucun paiement n'est confirmé par une réponse HTTP, un webhook ou l'ouverture d'un lien. Aucune adhésion n'est admise.
- La composition de serveur `composePublicTaraSandboxV5C()` **n'appelle jamais** `listen()`. `issueLinks` vaut **false** par défaut ; le système est désactivé hors `sandbox`.

### Prérequis

1. Tous les lots V5-C.23–26 ont été extraits et leurs scripts appliqués.
2. Migration 023 : si déjà exécutée en base **avant** les corrections 024/026, ne pas la réécrire en place. Examiner une migration corrective et les lignes déjà créées. Sur un projet DEV neuf, utiliser la version corrigée.
3. En DEV isolé seulement : vérifier les migrations 020, 021, 023 et exécuter la migration 027 après revue SQL. **Ce ZIP n'exécute aucune migration.**
4. Pour monter une route : fournir de vrais `verifyHuman` et `enforceRateLimit` *serveur* (pas de `()=>true` hors tests), la connexion PostgreSQL TLS vérifiée au rôle `pdc_tara_v5c_writer` (initialement `PASSWORD NULL`) et le client Tara privé. Aucune clé côté React.
5. **Ne pas utiliser de clés de production Tara** dans un test qui crée un lien : l'API pourrait réellement créer une demande payable. Les tests fournis utilisent des objets simulés, sans réseau.

## Installation dans Codespaces (branche feature/v5c)

Déposer `PDC_V5C_027_fin_de_journee.zip` à la racine du projet puis exécuter :

```bash
cd /workspaces/PDC-v5c
unzip -n PDC_V5C_027_fin_de_journee.zip
python3 scripts/patch-v5c-027-public-issuance.py

# Tests ciblés : 19+ scénarios nouveaux + régressions
node --test \
  backend/pdc-api/test/v5c-tara-public-issuer.test.mjs \
  backend/pdc-api/test/v5c-tara-public-composition.test.mjs \
  backend/pdc-api/test/v5c-tara-diagnostic.test.mjs \
  backend/pdc-api/test/v5c-tara-selected-channel-sql.test.mjs \
  backend/pdc-api/test/v5c-tara-channel-links.test.mjs \
  backend/pdc-api/test/v5c-tara-public-checkout-coordinator.test.mjs \
  backend/pdc-api/test/v5c-tara-public-order-http.test.mjs

npm test --prefix backend/pdc-api
node --test tests/*.test.mjs
npm run build
git diff --check
git status --short
```

**Ne pas faire de `supabase db push` aujourd'hui**, ni de commit avant validation des résultats dans ton Codespace. Les fichiers nouvelles fonctionnalités peuvent être encore `??` (c'est normal). `git diff --check` ne voit pas les fichiers `??` non indexés.

## Diagnostic des URL : sans appel réseau

```bash
node scripts/diagnose-v5c-tara-links.mjs tests/fixtures/v5c27-tara-response-fictive.json
```

Pour un test avec une vraie réponse `POST /api/tara/paymentlinks` **déjà obtenue**, mettre temporairement le JSON dans un fichier **HORS DÉPÔT** comme `/tmp/tara-reponse-privee.json`. Puis :

```bash
node scripts/diagnose-v5c-tara-links.mjs /tmp/tara-reponse-privee.json
rm -f /tmp/tara-reponse-privee.json
```

Le diagnostic n'effectue **aucune requête réseau**, ne copie pas les URL complètes, ni les paramètres sensibles, ni la clé Tara dans le terminal. Il rend le nom du champ, le protocole et le domaine seulement. Un lien `sms:` est un lien de partage de message, pas une garantie de paiement Mobile Money. Tester manuellement les parcours réels avant toute activation.

**Attention :** le validateur actuel impose pour `cardLink` un chemin `https://taramoney.com/card/...` : si Tara renvoie en réalité un autre chemin légitime, le diagnostic le refusera. Vérifier un exemple de réponse réel, puis ajuster la liste autorisée de façon explicite. Ne jamais remplacer par une URL libre ou par `generalLink`.

## Vérification SQL sur DEV — seulement plus tard

Migration DEV additive proposée : `supabase/migrations/20261028002700_pdc_v5c_tara_selected_channel_dev.sql`.

Après examen humain et application **sur un projet DEV isolé**, exécuter en SQL Editor :

`tests/sql/v5c27-selected-channel-inspection.sql`

Le script de contrôle est **lecture seule** et encadré `BEGIN; ... ROLLBACK;`. Il vérifie les deux fonctions, les quatre colonnes et l'absence de droit public. **Aucun essai PostgreSQL réel n'a été exécuté ici.**

## Limites restantes (ne pas annoncer l'encaissement activé)

- Le serveur HTTP de commandes est **construit mais non monté ni déployé** ; `Adhérer` et `Soutenir` restent des prévisualisations tant que leur appel HTTP réel n'est pas connecté.
- Les quatre parcours complets ne sont pas encore pris en charge : cotisation annuelle supplémentaire, couple diaspora et opérations EUR restent à traiter après arbitrage tarif/FX.
- Les webhooks ne confirment aucun paiement. Les preuves Tara, commissions supportées par le PDC, net effectivement reçu, rapprochement bancaire, admission, génération de carte restent soumis à un mécanisme de vérification indépendant.
- Pour les URL réelles : `smsLink`, WhatsApp, Telegram et Dikalo peuvent ouvrir une **application de partage** et non un écran d'encaissement direct. Il faut observer l'ouverture réelle de chaque lien.
- Ne pas exposer d'information d'adhésion (sensible) dans des logs ou télémétries des formulaires.

## Fichiers fournis

- `backend/pdc-api/src/v5c/tara-public-issuer-v5c.mjs` : demande du lien unique par canal, marque revue manuelle en cas d'incertitude, recharge idempotente.
- `backend/pdc-api/src/v5c/tara-selected-channel-pg-v5c.mjs` : adaptateur de RPC privées.
- `backend/pdc-api/src/v5c/tara-public-sandbox-app-v5c.mjs` : composition inerte du serveur DEV.
- `supabase/migrations/20261028002700_pdc_v5c_tara_selected_channel_dev.sql` : sauvegarde atomique et contrôle des droits.
- `scripts/patch-v5c-027-public-issuance.py` : extension contrôlée de 3 modules V5-C.24/25/26, réexécutable.
- `scripts/diagnose-v5c-tara-links.mjs` et fixture fictive : diagnostic hors réseau.
- Quatre fichiers de tests Node et un script d'inspection SQL.
