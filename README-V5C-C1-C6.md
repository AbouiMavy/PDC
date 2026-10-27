# PDC V5-C — Noyau transactionnel et préparation du SDK Tara (sans activation)

## Statut : lot de construction intermédiaire sur une SEULE branche `feature/v5c`

Ce lot est **une fondation testable**, et ne réalise pas encore la V5-C complète : **aucun endpoint**, aucune migration, aucun paiement réel, aucune exposition des dossiers politiques ou des clés Tara. Il ajoute les invariants nécessaires aux modules C1–C6, puis ils seront connectés dans la même grande itération.

- **C1 Dossiers** : devis métier reconstruit à partir des données privées du serveur, non d'un prix navigateur ; références UUID et bénéficiaires distincts.
- **C2 Renouvellements** : accès seulement après identité Supabase Auth vérifiée et correspondance avec `member_auth_links`, jamais par simple numéro/email.
- **C3 Financement** : sommes décimales entières, devises EUR/XAF séparées ; pour un couple, 4 000 centimes EUR = **une** commande avec **deux** bénéficiaires.
- **C4 TaraMoney** : frontière de confiance ; les callbacks React `SUCCESS` ne confirment **jamais** une transaction. Vérification serveur encore à câbler selon la documentation réelle de la clé et des webhooks Tara.
- **C5 Rapprochement** : déduplication par événement, transitions permises, événements en retard, statut de remboursement, revue humaine des contradictions ; répartition des dons à 100,00 % sans flottants.
- **C6 Intégration** : les composants publics React restent en simulation ; aucun SDK ni secret n'est ajouté au bundle.

## Ce qu'il faut vérifier auprès de TaraMoney (sans communiquer de valeur secrète)

1. Nature de chaque identifiant : `apiKey` **publique** ou clé serveur privée, `businessId`, éventuel token de webhook, et environnement sandbox/production. Ne jamais confondre clé provisoire et clé publiable.
2. Disponibilité du SDK `@taramoney/react-sdk` et provenance du package. La fiche npm existe, mais le dépôt GitHub mentionné dans la fiche ne s'ouvre pas publiquement lors de la vérification (octobre 2026). Faire confirmer le package exact par Tara et l'auditer avant installation.
3. Contrat exact webhook : schéma, signature/HMAC (si disponible), horodatage, clé de déduplication, possibilité de récupérer un paiement **serveur à serveur**, statuts de remboursement.
4. Les formulaires FR/EN, les prix et le destinataire du paiement doivent être figés côté serveur, pas copiés depuis le navigateur.
5. Attention à `TaraProvider` : le SDK npm documente une API client et plusieurs stratégies de proxy. **Le proxy Vite ne fonctionne que pour le serveur DEV**, pas pour le build statique Vercel. Prévoir un backend autorisé dédié, pas une règle Vercel de réécriture non authentifiée.

## Sécurité non négociable

- Pas de `VITE_TARA_SECRET`, pas de secrets dans `.env` versionné, React, console, QR code ou historique Git.
- Ne pas faire confiance à `onSuccess`, à la redirection navigateur ni au montant fourni par le client.
- Vérifier l'événement AVANT toute mutation PostgreSQL ; transaction + verrouillage + contrainte UNIQUE sur l'ID d'événement.
- Les statuts `failed`, `cancelled` et `refunded` ne deviennent jamais arbitrairement `confirmed` ; les conflits passent en revue humaine.
- Aucun dossier, adhésion ou droit de carte ne peut être créé sur la base d'un retour client seul.
- Pas de déploiement du backend ni de publication de données réelles pendant ces travaux.

## Application dans `/workspaces/PDC-v5c`

Déposer le patch à la racine du Codespace, puis :

```bash
git apply --check /workspaces/PDC/PDC_V5C_noyau_C1-C6.patch
git apply /workspaces/PDC/PDC_V5C_noyau_C1-C6.patch
node --test backend/pdc-api/test/v5c-core.test.mjs tests/v5c-boundaries.test.mjs
npm ci
npm ci --prefix backend/pdc-api
node --test tests/*.test.mjs
npm test --prefix backend/pdc-api
npm run build
node scripts/check-v5b-release-candidate.mjs
git diff --check
```

**Pas de Pull Request intermédiaire obligatoire**. Continuer sur `feature/v5c` jusqu'au lot C1–C6 complet. Conserver les environnements de développement isolés et n'appliquer aucune migration sur Supabase PROD.

## Prochaine phase de la même grande V5-C

Ajouter les migrations DEV uniquement, l'adaptateur backend Tara vérifié (sans supposer le format de signature), les endpoints idempotents, le branchement des formulaires, un test sandbox et les vérifications de contrôle d'accès. La librairie npm ne doit pas être introduite avant confirmation de sa provenance et des types de clés par Tara.
