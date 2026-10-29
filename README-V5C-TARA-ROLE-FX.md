# PDC V5-C — Lot IV : protection SQL et conversion EUR → XAF

**Branche : `feature/v5c`.** Lot additif, pas de PR intermédiaire, **pas de déploiement**.
Ce lot repose sur la migration précédente `20261027002000...` ; **ne PAS lancer `supabase db push`**. Aucun mot de passe ni clé Tara dans Git.

## 1. Tarification fixe pour Tara

Parité officielle de référence : **1 EUR = 655,957 XAF**. Aucun taux réseau, aucun flottant Javascript.
Les montants d'origine restent en centimes EUR. Le prix envoyé au fournisseur est en XAF, arrondi mathématiquement **à la dizaine la plus proche**, en une seule opération arithmétique sur entiers.

| Prix juridique | Valeur exacte | Tarif Tara XAF |
|---|---:|---:|
| 10 EUR | 6 559,57 XAF | 6 560 |
| 20 EUR | 13 119,14 XAF | 13 120 |
| 30 EUR | 19 678,71 XAF | 19 680 |
| **40 EUR couple** | 26 238,28 XAF | **26 240** |
| 50 EUR | 32 797,85 XAF | 32 800 |

Le module `tara-eur-xaf-v5c.mjs` n'accepte que les devis privés issus de `quoteFromPrivateDb`. Pour les devis EUR, la sortie reste **en attente d'approbation du rapprochement multidevise** : aucun paiement EUR n'est converti automatiquement en `payment_attempts` XAF. Le couple conserve **une dette de 4 000 centimes EUR, deux bénéficiaires, un seul règlement**.

**Limite** : le cours officiel fixe ne préjuge ni la devise effectivement débitée par Stripe/Tara, ni les commissions et marges du prestataire. Ces frais doivent rester comptabilisés à part.

## 2. Passerelle PostgreSQL dédiée (pas encore exécutée)

Nouvelle migration DEV : `20261027002100_pdc_v5c_tara_writer_gateway_dev.sql`.

- Crée `pdc_tara_v5c_writer` avec `PASSWORD NULL`, `NOINHERIT`, sans privilèges administrateur ni droits directs sur les tables.
- Accorde **uniquement l'exécution de sept fonctions SQL SECURITY DEFINER** dans `pdc_private`, avec `search_path=''` et références totalement qualifiées.
- La fonction de réservation exige une **ligne `payment_attempts` XAF existante** et **exactement une allocation** vers une obligation ou un don privé appartenant au payeur. Pas de réservation sur un UUID de devis arbitraire.
- Idempotence, transitions du lien, indice de webhook non authentifié et preuves auxiliaires restent séparés ; **aucune RPC ne modifie `payment_attempts.confirmed`, `payment_events`, les allocations ou les adhésions**.
- `tara-dev-pg-repository-v5c.mjs` n'exécute plus de requête CRUD directe : seulement ces RPC paramétrées.
- Le rôle n'est **pas opérationnel** sans mot de passe, configuration TLS et accord de déploiement DEV. Un test de droits PostgreSQL non destructeur est fourni dans `tests/sql/v5c-tara-writer-permissions-rollback.sql`.

### Périmètre volontairement limité

La nouvelle réservation SQL couvre **une seule obligation ou un seul don XAF lié à une unique allocation**. Les règlements fractionnés, les paniers multi-cibles et la dette EUR du couple nécessiteront une passerelle comptable distincte et auditée. Ne pas contourner la règle en fabriquant un paiement XAF pour représenter une dette EUR.

### Contrôles à effectuer avant toute autorisation d'application SQL

1. Vérifier le projet Supabase **DEV distinct de la production** et les migrations précédentes effectivement appliquées.
2. Revue humaine de toutes les fonctions `SECURITY DEFINER`, de leur propriétaire, des rôles existants, du `search_path` et des RLS.
3. Tester une base jetable d'intégration PostgreSQL et les conflits de paiement concurrents ; les tests Node fournis ne remplacent pas ce contrôle.
4. Ne définir un mot de passe du rôle technique et des variables serveur qu'après cette recette et confirmation écrite de l'environnement test Tara.
5. **Ne pas activer de route webhook/checkout publique, aucune confirmation de paiement ni délivrance de carte.**

## Tests sans accès réseau

```bash
cd /workspaces/PDC-v5c
node --test backend/pdc-api/test/v5c-tara-fx-security.test.mjs \
  backend/pdc-api/test/v5c-tara-dev-persistence.test.mjs
npm test --prefix backend/pdc-api
node --test tests/*.test.mjs
npm run build
node scripts/check-v5b-release-candidate.mjs
```
