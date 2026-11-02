# V5-C — Chargeur privé de devis TaraMoney (lot VI, préparation DEV)

But : fournir au module HTTP existant `loadAuthorizedCheckout({userId,paymentId})`.
Le montant XAF doit provenir de la base privée, pas du navigateur.

Fichiers :
- `backend/pdc-api/src/v5c/tara-authorized-checkout-loader-v5c.mjs`
- `backend/pdc-api/test/v5c-tara-authorized-checkout-loader.test.mjs`
- `supabase/migrations/20261028002200_pdc_v5c_tara_authorized_checkout_dev.sql`

La fonction SQL ne sélectionne un devis que lorsque le compte Supabase Auth vérifié par le serveur correspond, par `member_auth_links`, à un membre actif et au payeur d'un `payment_attempts` Tara XAF en attente, avec exactement une allocation et une obligation ou un don valide. La lecture conserve le montant brut.

**Limites** :
- NE PAS exécuter la migration avant revue SQL, vérification du projet DEV, tests de permissions avec le rôle réel et confirmation de la séparation production.
- Ce lot ne crée **aucune** personne, aucun don, aucune adhésion ni `payment_attempts`. Il ne couvre pas les nouveaux adhérents ni les dons publics anonymes : ils exigent une création atomique côté serveur, protégée des abus. Les paiements EUR sont encore exclus.
- Le rôle `pdc_tara_v5c_writer` n'a toujours pas de mot de passe, et donc pas d'accès runtime réel.
- La route HTTP n'est pas montée dans `index.mjs` ; aucune connexion ni appel réel Tara n'est lancé.
- Le corps de requête reste limité à `paymentId` et `idempotencyKey` ; aucune valeur brute de contribution n'est crue par le serveur.
- Le solde encaissé et la commission Tara feront l'objet d'un rapprochement indépendant sur des données de transaction individuelle.

Pour tester localement, depuis la racine du dépôt :

```bash
node --test backend/pdc-api/test/v5c-tara-authorized-checkout-loader.test.mjs
npm test --prefix backend/pdc-api
npm run build
git diff --check
git status --short
```

Ne pas déployer, ne pas lancer `supabase db push`, ne pas ajouter des secrets dans le dépôt.
