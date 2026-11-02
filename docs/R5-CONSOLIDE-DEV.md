# PDC — R5.1 Grande itération consolidée (DEV)

**Base exacte :** `AbouiMavy/PDC`, `feature/v5c44`, `252d7a63b42d9a033eaada8b6b0dd79d5ea70a92`. **Date :** 30 octobre 2026. **Projet DEV :** `rvgpnmznhzwlzqyefahd`.

## Principes non négociables

1. **Ne PAS refaire R4** : aucun fichier de migration `04510` ni aucun mécanisme de confirmation R4 n'est modifié. Le code de l'émetteur Tara R4 n'est pas modifié. Le seul raccordement R4 modifié concerne l'interface de retour fournisseur.
2. **Diaspora validée** : `15 € = 9 840 XAF`, `30 € = 19 680 XAF`, `40 € le couple = 26 240 XAF`, taux de référence PDC `1 € = 656 XAF`, arrondi supérieur à 10 FCFA. **Aucun frais initial diaspora de 2 000 FCFA**. La liste EUR est importée du module existant `src/features/adhesion/tarifs.mjs`, la conversion utilise l'algorithme EXISTANT `tara-rate-quote-r4.mjs` avec le taux 656 fixé. **Pas de nouvelle table FX ni de taux négocié par le client**.
3. **Couple = un paiement**, deux personnes ; aucune seconde transaction fictive en EUR. Le compte de paiement prestataire demeure XAF ; l'obligation légale reste EUR. La preuve marchande XAF est rapprochée, pas fabriquée en EUR. La fonction historique F2/F3 attend, pour sa voie d'origine, un paiement EUR : il est interdit de la contourner par une fausse opération EUR. R5 crée une passerelle de rapprochement et sa propre procédure administrative privilégiée en réutilisant le compteur de numérotation V5B.62.
4. **Données sensibles** : dossiers et photographies privés, aucun `service_role` dans Vite. Aucun dossier authentique dans les tests. La case préexistante `consentPartenaire` atteste l'accord déclaré par le demandeur ; R5.1 exige une **autre case explicite** pour le don conditionnel, sans remplacer la première. Le partenaire confirme personnellement via un courriel à jeton unique, sans bloquer le paiement. Il reste `draft` jusqu'à confirmation.
5. **Retour Tara** : réutilisation des pages existantes `/adhesion/merci` et `/soutenir/merci`, pas de nouvelle page de remerciement. Le paramètre URL et `sessionStorage` **ne confirment jamais** paiement ou admission. Un accusé de réception est distinct du justificatif TaraMoney.

## Étendue des fichiers du paquet

### Briques réutilisées sans modification

- `src/features/adhesion/tarifs.mjs`, `src/features/adhesion/carte.mjs`.
- `backend/pdc-api/src/v5c/tara-rate-quote-r4.mjs`, `tara-server-client-v5c.mjs`, `tara-channel-links-v5c.mjs`, vérificateur Turnstile et limiteur PostgreSQL R4.
- `backend/pdc-api/src/portrait-normalize-v5b610b.mjs`, `portrait-policy.mjs`, bucket Storage privé DEV.
- V5-B.62 pour le compteur national transactionnel et les identifiants `M/F-PDC-I-...`.
- `src/pages/AdhesionMerci.jsx`, `src/pages/Merci.jsx`, `PendingManualReceiptV5C44.jsx` ; les trois restent intacts.

### Nouvelles fonctions R5

- **Dossier diaspora** : `r5_create_diaspora_dossier_dev`, validation serveur et SQL, tarif et change constants, consentements et rattachement, idempotence, session à secret haché.
- **Photos avant paiement** : deux rôles techniques distincts, octroi TTL 10 min sur possession de la session, hash SHA-256, JPEG normalisé V5-B sans EXIF, stockage dans le bucket privé existant sous un préfixe `provisional-r5`, aucune URL publique, intégrité relue après écriture.
- **Émission Tara** : intention persistée dans la table V5-C existante ; nouvel adaptateur R5 parce que les RPC R4 des canaux exigent `public_checkout_orders_v5c` domestique. Réutilisation du client et des validations Tara V5-C ; un seul appel fournisseur, état `unknown` et revue humaine en cas de résultat incertain.
- **Finance** : preuve individualisée du dashboard marchand, vérification de `productId`, référence fournisseur, brut/net/frais, date, unicité ; confirmation DEV manuelle distincte. Vue `r5_diaspora_finance_bridge_admin_dev` en lecture privée ; ne crédite pas artificiellement l'obligation EUR.
- **Admission** : `r5_admit_verified_diaspora_dev` exclusivement SQL Editor DEV, confirmation explicite distincte et vérification financière, admission indivisible du couple, numéros nationaux issus du compteur V5-B.62 ; statut membre `active` mais `verified_at=NULL` jusqu'à revue, aucune carte émise.
- **Cartes** : préparation/readiness et vue administrative des portraits à promouvoir vers F1 ; aucune délivrance ou publication de photo avant revue et promotion autorisée.
- **Couple ex post** : paiement immédiat à 40 €, courriel personnel au partenaire, 14 jours pour répondre ; faute de confirmation ou en cas de refus, régularisation administrative après paiement vérifié à 30 € de cotisation et 10 € de don selon l’autorisation expresse du payeur. Voir `R5-1-ARBITRAGE-COUPLE-COURRIEL.md`.
- **Retours** : route `/retour-paiement` lit un accusé provisoire conservé pendant 60 minutes dans le même onglet, le conserve uniquement jusqu’à expiration (60 min), puis dirige vers la page existante. En retour sur un autre appareil/onglet, les pages affichent seulement une attente générique, sans références fabriquées. La récupération authentifiée hors session reste une fonctionnalité non implémentée.

## Installation unique — Codespaces

Utiliser uniquement une copie de travail propre sur le commit ci-dessus. Aucun `git reset --hard`, `push --force`, migration automatique ou commande Tara n'est exécuté par l'installateur.

```bash
cd /workspaces/PDC
git status --short
git branch --show-current
git rev-parse HEAD
unzip -n pdc-r5-1-couple-courriel.zip
node pdc-r5-1-couple-courriel/install-r5.mjs
node --test backend/pdc-api/test/r5-consolide.test.mjs
(cd backend/pdc-api && npm test)
node --test tests/*.test.mjs
npm run build
git diff --check
git status --short
```

L'installateur vérifie branche, commit et répertoire propre ; copie les nouveaux modules avec interdiction d'écrasement ; applique **quatre patchs ciblés** : `Adhesion.jsx`, `PublicCheckoutV5C29.jsx`, `RetourPaiementV5C44.jsx`, `App.jsx`. En cas d'erreur d'écriture, il restaure les fichiers patchés et retire les nouveaux fichiers copiés. Il ne touche PAS à l'émetteur Tara R4 ni aux pages de remerciement spécialisées.

## SQL DEV — revue séparée obligatoire

**NE PAS exécuter avant revue humaine**, et ne jamais appliquer en production ou avec une base non confirmée DEV.

1. Vérifier l'historique réel, notamment migration R4 `20261029004510...` appliquée dans `rvgpnmznhzwlzqyefahd`.
2. Examiner intégralement `supabase/migrations/20261030004600_pdc_r5_consolidated_intake_dev.sql` (migration additive). Elle crée rôles `NOLOGIN` et fonctions minimales. Les identifiants PostgreSQL et les mots de passe des deux rôles techniques R5 doivent être provisionnés **séparément**, sans secret Git.
3. Appliquer la migration **une seule fois** dans SQL Editor DEV. Ne pas lancer un `supabase db push` global sur un historique partiellement appliqué à la main.
4. Déclarer la version exacte des textes acceptés dans `r5_policy_versions`, **avec l'empreinte SHA256 vérifiée et non inventée**. Tant que cette étape n'est pas faite, la création de dossier échoue en sécurité. Les documents du formulaire étant indiqués comme provisoires, ceci est un vrai prérequis, pas un défaut à contourner.
5. Exécuter le fichier entier `tests/sql/r5-security-audit-dev.sql`, qui se termine par `ROLLBACK`. Ajouter ensuite les tests transactionnels métiers d'intégration avec données fictives, puis retour et nettoyage.

### Activation facultative du serveur isolé R5 dans Codespaces

`backend/pdc-api/scripts/start-r5-sandbox.mjs` écoute sur **127.0.0.1:8790** après validation stricte Codespaces, DEV et Sandbox. Il n'est PAS lancé par l'installation. Il nécessite des secrets fournis localement au runtime :

- `PDC_R5_ENABLED=true`, `PDC_R5_MODE=sandbox`, `PDC_R5_LINKS_ENABLED=true`, `PDC_R5_SANDBOX_KEY_CONFIRMED=true`.
- `PDC_R5_PROJECT_REF`, `PDC_R5_ALLOWED_ORIGIN`, `PDC_R5_TURNSTILE_HOSTNAME`, `PDC_R5_TURNSTILE_SECRET`.
- `PDC_R5_INTAKE_DATABASE_URL`, `PDC_R5_PHOTO_DATABASE_URL` : utilisateurs PostgreSQL **distincts** et strictement limités ; TLS CA via `PDC_V5C30_DB_CA_FILE`.
- `PDC_R5_STORAGE_SERVICE_KEY` : **seulement serveur**, jamais `VITE_*`; bucket Storage privé vérifié.
- `PDC_R5_TARA_SANDBOX_API_KEY`, `PDC_R5_TARA_BUSINESS_ID`, `PDC_R5_WEBHOOK_URL` (HTTPS réel DEV).
- **R5.1 courriel** : `PDC_R51_RESEND_API_KEY` et `PDC_R51_EMAIL_FROM` (domaine expéditeur vérifié), exclusivement dans le serveur. Sans configuration valide, R5.1 refuse le démarrage, plutôt que de simuler un envoi.
- Limiteur SQL/HMAC R4 réutilisé via `PDC_V5C30_DATABASE_URL` et `PDC_V5C30_RATE_HMAC_SECRET`, avec plafond R5 de 12 appels pour couvrir création, deux jetons, deux dépôts et checkout du couple ; ce plafond ne modifie pas la limite du checkout domestique R4.

Frontend, toujours **désactivé par défaut** : `VITE_PDC_R5_ENABLED=true`, `VITE_PDC_R5_MODE=sandbox`, `VITE_PDC_R5_API_ORIGIN=https://<codespace>-8790.app.github.dev`, `VITE_PDC_R5_TURNSTILE_SITE_KEY=<clé publique uniquement>`.

**Ne pas activer ces interrupteurs avant tests SQL, sécurité Storage, consentements, et vérification d'environnement.** Ne pas réutiliser la clé TaraMoney de production pour le Sandbox. Les montants de test ne constituent pas des encaissements. Aucun OTP, carte réelle ou paiement effectif dans la recette sans approbation expresse.

## Scénarios de recette de bout en bout attendus (NON exécutés ici)

- Tarif 15/30/40 EUR et change 656, rejet du prix navigateur manipulé, absence de frais diaspora de 2 000 XAF.
- Rejeu de la même clé idempotente, changement de formulaire avec même clé interdit, perte de session sans nouvel accès.
- Session et jeton photo expirés, MIME non conforme, photo >5 Mo, deux fichiers distincts pour couple, bucket privé sans lecture anonyme, nettoyage après échec avant confirmation.
- Couple : deux cases obligatoires distinctes ; émission Tara possible avant réponse du partenaire ; courriel personnel à usage unique ; refus/expiration après 14 jours = 30 € d’adhésion individuelle et 10 € de don, seulement sur paiement vérifié.
- Tara : canal réellement sélectionné, pas de lien général substitué, aucun deuxième paiement après timeout ou état `requested`/`unknown`.
- Rapprochement : écart de référence/brut/net/frais, statut non payé, preuve marchand absente, doublon transaction ; aucun effet automatique sur adhésion.
- Admission administrative : privilèges et phrase explicite, deux numéros distincts, compteur V5B, rollback indivisible si un dossier manque ; aucun QR ni carte émise.
- Retour fournisseur dans le même onglet : redirection selon la demande vers la **page de remerciement existante**, accusé provisoire; retour autre onglet = attente neutre ; jamais paiement `confirmed` basé sur URL.
- Tous les tests V5B/V5C/R4, CI et compilation Vite, y compris Safari mobile et FR/EN.

## Limites à ne pas masquer

- Les tests unitaires de R5 ont été exécutés dans un **harnais isolé** avec copies de contrats V5B/V5C. Cela n'est **pas une recette GitHub Actions**, ni une exécution SQL sur la base DEV.
- La promotion contrôlée des portraits `provisional-r5` dans `card_portrait_assets` V5-B, la génération et la délivrance matérielle/digitale des cartes restent une opération administrative **à intégrer et valider** ; seule leur préparation protégée est livrée.
- Le statut de retour et les références retrouvées depuis la session navigateur ne prouvent pas le paiement. La récupération indépendante par connexion authentifiée n'est pas incluse.
- La liaison financière EUR juridique / XAF prestataire est exposée en vue privée, pas convertie en un paiement EUR fictif dans `obligation_balances` historique. Toute comptabilisation consolidée de l'obligation nécessite la validation du traitement comptable multi-devises.
- L’envoi par courriel et la réponse à usage unique sont codés, **mais nécessitent un prestataire configuré et une recette réelle DEV**. En cas d’échec fournisseur incertain, la relance exige une intervention humaine. La régularisation après 14 jours est une procédure SQL administrative, pas une tâche périodique activée.
- Ni recette de paiement réelle, ni migration, ni déploiement, ni admission ne sont déclenchés par l'archive.

## Intégration GitHub

Après tests et vérification SQL DEV seulement, un unique commit R5 peut être préparé sur `feature/v5c44` puis une PR vers `develop`. **Ne pas fusionner dans `main` automatiquement** : valider les checks et les déploiements Vercel, les permissions SQL, et vérifier l'absence d'activation du checkout public.

> **Important R5.1 :** ne pas utiliser l’ancienne archive R5 ni réappliquer la migration 04600 si elle a déjà été exécutée. Ce paquet remplace R5 pour une installation NEUVE sur la base R4 confirmée.
