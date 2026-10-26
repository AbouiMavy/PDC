# PDC – V5-B.2 | Admission expérimentale nationale

**Statut : prototype technique réservé à `pdc-developpement`. Ne pas déployer en production.**

Ce correctif ne remplace aucun fichier V5-B.1. Il ajoute une migration SQL, un test d'intégration SQL réversible et des contrôles statiques Node.

## Fonctionnement
- La procédure interne `pdc_private.admit_member_dev(application_id, actor_user_id)` admet un dossier initial **Cameroun uniquement** après consentement, contrôle d'une habilitation `national_admin` en cours de validité et constat du paiement confirmé des **2 000 FCFA** initiaux.
- Un verrou sur la personne réduit les risques de double admission simultanée ; `memberships.person_id` et `member_number` sont déjà uniques dans V5-B.1.
- Un numéro **strictement provisoire** `PDC-DEV-AAAA-00000001` est attribué par une séquence PostgreSQL. La numérotation définitive du PDC est à arbitrer et doit faire l'objet d'une migration de remplacement.
- Une ré-exécution d'une admission validée renvoie le même identifiant et le même numéro (idempotence).
- Deux déclencheurs enregistrent les changements de statut des dossiers et des adhésions dans `audit_log`, sans reproduire les coordonnées ou l'identité en texte libre.
- Une seule demande initiale par personne peut être en statut `accepted`.
- Les dossiers de la diaspora sont volontairement exclus de **cette fonction expérimentale** : les modalités de paiement et la politique d'admission doivent être définitivement arbitrées.

## Installation Codespaces (`feature/v5b`)

1. Enregistrer les changements de V5-B.1 dans Git avant les tests de V5-B.2.
2. Déposer `pdc-v5b2-admission-dev.zip` à la racine du dépôt.
3. Installer :
   ```bash
   unzip -n pdc-v5b2-admission-dev.zip
   node --test tests/v5b2-admission.test.mjs
   git diff --check
   npx supabase db push --linked --dry-run
   ```
4. Le `--dry-run` doit annoncer **seulement** `20261025000200_pdc_v5b2_admission_dev.sql`.
5. **Après revue** de la liste de migrations et confirmation que le projet lié est uniquement `pdc-developpement`, exécuter :
   ```bash
   npx supabase db push --linked
   npx supabase migration list --linked
   ```
6. Dans **Supabase SQL Editor du projet de développement**, coller la totalité de `tests/sql/v5b2-admission-test.sql`. Vérifier les mentions `BEGIN;` et `ROLLBACK;`. Cliquer sur Run. Le script teste 8 scénarios ; il doit afficher `Success. No rows returned`. Certaines interfaces n'affichent pas les NOTICE.
7. Vérifier qu'aucun compte fictif ne reste :
   ```sql
   SELECT count(*) AS comptes_test_restants
   FROM auth.users WHERE email LIKE 'pdc-v5b2-%@example.invalid';
   ```
   Résultat attendu `0` (si aucune fixture préexistante portant ce motif).

**Attention** : la fixture SQL crée un utilisateur technique `auth.users` fictif, uniquement dans la transaction annulée. Si le schéma Auth de ton environnement exige des colonnes additionnelles et rejette cette création, noter le message d'erreur et arrêter : ne pas contourner les contraintes de sécurité.

## Sécurité – limites connues avant connexion d'une vraie API
- `p_actor_user_id` est un identifiant fourni à la fonction. **La base ne peut pas prouver seule l'identité du demandeur**. Une future API Node.js devra vérifier cryptographiquement la session de l'agent, lui associer l'ID Auth et interdire toute valeur arbitraire fournie par le navigateur.
- Les identifiants PostgreSQL privilégiés, les connexions directes et les clés secrètes ne doivent jamais se trouver dans React, les archives, Git ou les journaux.
- `service_role` possède actuellement des droits étendus dans le schéma V5-B.1. Le système n'est pas encore cloisonné selon le principe du moindre privilège. L'API devra utiliser un rôle technique dédié, restreint et contrôlé ; la migration d'admission n'est **pas une autorisation d'exploitation réelle**.
- Le statut `confirmed` d'un paiement doit être établi uniquement par le backend après preuve bancaire ou validation du webhook, non par simple saisie du navigateur.
- L'audit V5-B.2 couvre les dossiers et adhésions, pas encore toutes les écritures financières, corrections, habilitations et suppression de données.
- La facturation diaspora/couple, les documents légaux et l'identifiant officiel restent en suspens.
- `ROLLBACK` supprime les lignes fictives mais **une séquence peut avancer même après annulation**, ce qui est normal ; aucune continuité parfaite des numéros ne doit être exigée.

## Ce que cette livraison ne fait pas
Elle ne modifie aucun formulaire React, n'active aucune connexion publique Supabase, ne crée aucune API Node.js exposée, n'active aucun moyen de paiement et n'autorise aucun dossier réel. La V5-B.3 portera sur l'authentification serveur, les habilitations et les essais de requêtes via une API Node dédiée.

## Validation du correctif
Tests Node : contrôle de la présence des règles dans les scripts. La vraie validation est l'exécution de `v5b2-admission-test.sql` contre PostgreSQL de développement après application de la migration, puis la revue des droits, des sessions et du serveur.
