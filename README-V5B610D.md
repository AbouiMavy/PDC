# PDC V5-B.6.10-D — Premier upload réel d'un portrait entièrement fictif

**Développement uniquement** : branche `feature/v5b`, projet `rvgpnmznhzwlzqyefahd`.
**Pré-requis :** 13 migrations synchronisées, rôle `pdc_portrait_upload_runtime_v5b610c` connecté (déjà testé), bucket privé `pdc-member-portraits-dev`, code V5-B.6.10-B/C installé, dépendance `sharp`, backend `.env` existant.

## Garantie de périmètre

Aucune route publique, aucune photographie de militant et aucune émission de carte. L'exercice crée **temporairement un dossier de membre fictif** via SQL Editor, charge l'image synthétique `tests/assets/fictive-portrait-test.png` depuis Codespaces au travers des modules serveur existants, puis nécessite un nettoyage. La référence des membres fictifs porte `TEST-V5B610D-...` et ne consomme **aucun numéro militant officiel**. La configuration ne persiste aucun nouveau secret sur disque et exige le compte Auth fictif `pdc-v5b3-test@example.invalid`.

**Avertissement :** le compte PostgreSQL technique reste capable d'appeler trois fonctions SQL qui acceptent un `actorId` ; si son mot de passe est divulgué, celui-ci peut être usurpé. Le mot de passe devra être désactivé avec `ALTER ROLE ... PASSWORD NULL` **après** l'essai et ce dispositif n'est pas une architecture de production. Ne pas stocker `service_role` dans `.env` ni dans Git.

## Étape 1 — Installer et tester localement

Téléverser l'archive ZIP à la racine `/workspaces/PDC`, puis :

```bash
cd /workspaces/PDC
unzip -o pdc-v5b610d-upload-fictif.zip
node --test tests/v5b610d-live-portrait.test.mjs
```

Attendu : **8 tests réussis, 0 échec**. Aucune migration à pousser.

## Étape 2 — Créer le dossier entièrement fictif dans Supabase SQL Editor

Exécuter le fichier `tests/sql/v5b610d-create-fixture-dev.sql` dans le **projet de développement**, une seule fois. Ce script utilise `COMMIT` car l'upload aura lieu dans une autre connexion. Il attribue une habilitation de test limitée dans le temps au compte Auth fictif s'il n'en possède plus.

Il affiche une table avec `fictive_reference` et `card_request_id`. **Copier ces deux valeurs** (la référence servira au nettoyage, le UUID à l'envoi). Ne pas les communiquer avec des secrets.

## Étape 3 — Téléversement fictif depuis Codespaces

Ouvrir **un nouveau terminal** :

```bash
cd /workspaces/PDC/backend/pdc-api
export PDC_SUPABASE_PROJECT_REF=rvgpnmznhzwlzqyefahd
export PDC_ENABLE_PORTRAIT_UPLOAD_DEV=YES
export PDC_LIVE_PORTRAIT_TEST=YES
export PDC_TEST_ADMIN_EMAIL=pdc-v5b3-test@example.invalid
export PDC_TEST_CARD_REQUEST_ID='COLLER_LE_CARD_REQUEST_ID'
read -rsp 'Mot de passe compte Auth fictif : ' PDC_TEST_ADMIN_PASSWORD; echo
read -rsp 'Mot de passe rôle PostgreSQL dédié : ' PDC_TEST_WRITER_PASSWORD; echo
read -rsp 'Clé service_role du projet DEV : ' SUPABASE_SERVICE_ROLE_KEY; echo
export PDC_TEST_ADMIN_PASSWORD PDC_TEST_WRITER_PASSWORD SUPABASE_SERVICE_ROLE_KEY
node --env-file=.env scripts/test-live-portrait-v5b610d.mjs
unset PDC_TEST_ADMIN_PASSWORD PDC_TEST_WRITER_PASSWORD SUPABASE_SERVICE_ROLE_KEY
```

**ATTENTION :** la saisie des trois secrets est masquée. Ne jamais les afficher (`echo`), ne pas les coller dans le chat. Vérifier que l'adresse, le port et le compte API readonly sont déjà corrects dans le `.env` existant. Le rôle PG d'écriture est reconstruit en mémoire à partir du mot de passe fourni ; jamais stocké dans un fichier.

Si erreur `NOT_AUTHORIZED`, vérifier que la durée de 45 minutes de l'habilitation n'a pas expiré. Si `PDC_CONFIRMATION_UNCERTAIN_RECONCILE`, **ne pas supprimer à l'aveugle** : inspecter d'abord `card_portrait_assets` et Storage.

## Étape 4 — Vérification et nettoyage

1. SQL Editor : exécuter `tests/sql/v5b610d-inspect-fixture-dev.sql`. Attendu pour le dossier de test : `portrait_status=stored`, `objet_present_dans_storage=true`, `issued_at=NULL` et `delivered_at=NULL`.
2. Dans **Supabase Storage → pdc-member-portraits-dev → card-requests → UUID**, supprimer exclusivement `asset_id.jpg` affiché par l'outil. **Ne pas utiliser `DELETE FROM storage.objects`**.
3. SQL Editor : adapter **uniquement** la variable `v_ref` dans `tests/sql/v5b610d-remove-fixture-dev.sql`, puis exécuter. Ce script refuse de retirer le dossier tant que l'objet Storage existe encore ou si des paiements / numéros officiels lui ont été liés. Les traces d'audit techniques sont conservées.
4. Désactiver immédiatement la connexion du rôle technique via SQL Editor :

```sql
ALTER ROLE pdc_portrait_upload_runtime_v5b610c PASSWORD NULL;
```

5. Dans le terminal Codespaces, en cas d'interruption avant `unset`, exécuter également :

```bash
unset PDC_TEST_ADMIN_PASSWORD PDC_TEST_WRITER_PASSWORD SUPABASE_SERVICE_ROLE_KEY
```

Ne pas passer à un téléversement de photos réelles avant une authentification propre aux adhérents, des autorisations limitées aux dossiers et une procédure de nettoyage auditée.
