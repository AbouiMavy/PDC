# PDC – V5-B / modèle de données centralisé (préparatoire)

## Objet
Base unifiée des adhésions, cotisations fractionnées et dons. La V5-A reste en **démonstration**. Aucun fichier du formulaire, aucune route React, aucun prestataire de paiement et aucun identifiant réel n'est activé par cette livraison.

## Architecture
- PostgreSQL/Supabase dans un schéma **`pdc_private`**, non exposé au navigateur.
- `people` : données personnelles sensibles et rattachement communal.
- `membership_applications` : demandes et acceptation datée des documents.
- `member_auth_links` : relation optionnelle future entre l'identité authentifiée et le numéro militant (créée uniquement après contrôle administratif).
- `memberships` : numéro militant unique attribué après admission par un responsable habilité.
- `dues_obligations` : deux catégories indépendantes : 2 000 XAF de première adhésion, et cotisation annuelle selon barème (une par année et personne).
- `payment_attempts` : tentatives et transactions avec références uniques.
- `payment_allocations` : distribution d'une transaction entre frais, cotisation annuelle et don.
- `payment_events` : dédoublonnage des notifications fournisseur. La signature doit être vérifiée **avant** l'enregistrement.
- `donations` et `donation_designations` : conservation de l'affectation et de l'anonymat public.
- `role_assignments` : périmètre des futurs droits (national / région / département / commune) ; **aucun droit territorial n'est activé maintenant**.
- `audit_log` : historique des actions sensibles, sans secrets ni copies de formulaires complets.

## Paiement fractionné — exemple
Militant urbain, première adhésion :
- Frais d'adhésion : **2 000 XAF** sur une obligation autonome (à payer une seule fois).
- Cotisation annuelle : **12 000 XAF** sur une deuxième obligation.
- Paiement initial de 5 000 XAF : allocation 2 000 vers frais et 3 000 vers cotisation.
- Paiement ultérieur de 4 000 XAF : affectation de 4 000 sur cotisation.
- Solde annuel : 12 000 − (3 000 + 4 000) = **5 000 XAF**.
- Attention aux unités : **XAF = FCFA entiers, EUR = centimes**. Ainsi 30 € doivent être stockés comme 3 000 centimes, et jamais comme 30.
- Les états `initiated`, `pending`, `failed`, `cancelled`, `refunded` ne comptent PAS comme encaissés.
- Les remboursements et rejets doivent donner lieu à écritures de correction/audit ; ne pas effacer l'historique.

## Règles de sécurité non négociables
1. Aucune saisie de numéro militant ne doit dévoiler une fiche sans authentification supplémentaire.
2. Aucune adresse personnelle, affiliation ou donnée de cotisation ne doit être publique.
3. Aucun numéro militant ne sera fabriqué ou considéré comme validé par le navigateur.
4. Les valeurs tarifaires et les montants réclamés doivent être recalculés côté serveur, indépendamment de React.
5. Les webhooks doivent être authentifiés cryptographiquement, validés, puis traités de manière idempotente dans une transaction atomique ; la contrainte d'unicité n'est pas suffisante à elle seule.
6. Tout paiement réel nécessitera un prestataire raccordé, la vérification des devises, l'anti-double crédit et le contrôle des dépassements en cas de paiement concurrent.
7. Ne pas appliquer cette migration à une base existante sans inventaire des schémas, revue SQL, tests réels PostgreSQL, sauvegarde et procédure de retour arrière.
8. Conservation et accès : finalités, habilitations, durées, droits de rectification, mesures de sécurité et conformité juridique doivent être validés avant toute collecte réelle.

## Gouvernance : aujourd'hui / demain
- V5-B initiale : administrateurs nationaux uniquement, via future API sécurisée. Aucun accès à `pdc_private` pour les rôles navigateur `anon` et `authenticated`.
- Plus tard : rôles régionaux, départementaux et communaux, avec portée territoriale et validation des actions. La table des habilitations anticipe le besoin sans l'activer.
- Les droits devront être testés au niveau des données, pas simplement en cachant des boutons dans React.

## Réserves avant mise en production
- Il manque les procédures d'admission, la validation des barèmes applicables, la politique d'identifiant militant, le mécanisme de vérification du contact et le traitement des adhésions de couple.
- La migration est un **point de départ technique**, non une base nationale prête à recevoir les dossiers réels.
- Aucun test d'exécution SQL contre un serveur PostgreSQL/Supabase n'a été effectué dans cette livraison ; les tests Node.js fournis ne remplacent pas cet essai.
