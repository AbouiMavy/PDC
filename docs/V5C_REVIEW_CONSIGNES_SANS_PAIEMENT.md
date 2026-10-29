# PDC V5-C — Consignes de revue et de tests sans paiement

**Statut : revue technique et recette fonctionnelle — 29 octobre 2026**  
**Circuit d'intégration :** `feature/v5c` → `develop` → `main`

> **CONSIGNE IMPÉRATIVE : NE VALIDER AUCUN PAIEMENT.** Aucun débit de carte, aucune confirmation Mobile Money, aucun code OTP ou code de validation, aucun virement bancaire et aucun paiement réel, même de faible montant. Utiliser des données fictives pour les formulaires.

La version V5-C est soumise à la revue **sans retrait ni modification des fonctionnalités**. Les choix de moyens de paiement et les coordonnées de virement restent visibles dans l'interface ; leur présence **ne signifie pas qu'un encaissement automatisé est opérationnel**.

## 1. Parcours disponibles pour revue, sans paiement

| Parcours | Vérifications autorisées | Limite |
| --- | --- | --- |
| **Dons ponctuels** | Formulaire, montant, affectation libre ou ciblée, contrôles de saisie, récapitulatif | Ne jamais finaliser le paiement |
| **Première adhésion individuelle au Cameroun** | Identité, rattachement territorial, consentements, montant, récapitulatif | Checkout DEV raccordé pour l'adhésion initiale simple de **2 000 FCFA** uniquement |
| **Mobile Money** | Choix du moyen et contrôle visuel d'un lien SMS, dans le Sandbox autorisé | Ouvrir le SMS ne prouve pas le paiement ; ne confirmer aucune opération |
| **TaraMoney — lien général** | Choix du canal et examen visuel de la page hébergée, dans le Sandbox autorisé | Ne cliquer sur aucun bouton de paiement final |
| **Carte bancaire** | Choix du moyen et affichage de la page hébergée en Sandbox | Ne saisir ni valider aucune carte bancaire |
| **Virement bancaire** | Présentation des coordonnées et instructions | **Ne réaliser aucun virement**, y compris pour tester |
| **Ergonomie et traductions** | Navigation, responsive mobile, FR/EN, messages d'erreur et accessibilité | Signaler les anomalies sans répéter les soumissions |

**Précision technique :** les commandes et liens TaraMoney ne sont **pas activés par défaut**. Leur émission exige un environnement de développement explicitement configuré : Codespaces, Supabase DEV et clé TaraMoney Sandbox. Les collègues qui n'utilisent pas cet environnement peuvent examiner les formulaires et interfaces, sans création de commande.

## 2. Parcours non validés de bout en bout

- Renouvellement d'adhésion, cotisations simultanées et paiements associés.
- Formules couples et diaspora ; demande de carte de membre ; téléversement effectif des portraits.
- Dons mensuels et anonymat public dans le checkout intégré.
- Parcours de liens **WhatsApp, Telegram et Dikalo**, en attente de validation intégrée.
- Débit effectif d'une carte, encaissement Mobile Money, confirmation automatique d'un virement ou délivrance d'un justificatif financier définitif.
- Authentification des notifications réelles TaraMoney, rapprochement financier indépendant, confirmation atomique des paiements et décision d'admission après paiement.
- Résolution des écarts de conversion **EUR/XAF** et du problème d'encodage de certains libellés sur la page du prestataire.

Les interfaces correspondantes peuvent être consultées lorsqu'elles sont présentes, **sans considérer les fonctions financières comme opérationnelles**.

## 3. Résultats techniques déjà observés en DEV

- Enregistrement de commandes d'essai de dons et d'une adhésion initiale dans PostgreSQL DEV.
- Émission et conservation de liens TaraMoney Sandbox pour SMS, page générale et carte.
- Réception de **deux envois identiques** d'une notification simulée `PENDING` et persistance d'**un seul** enregistrement non vérifié.
- Paiement resté à l'état `initiated` ; aucune confirmation d'encaissement ni admission automatique.
- Consolidation du webhook et versionnement du correctif SQL des liens `cardpay/@...` sur `feature/v5c`.

Ces résultats **ne constituent pas une preuve d'encaissement réel**. La non-régression du nouveau comportement du webhook face à un produit inconnu sera contrôlée pendant la prochaine phase de sécurité.

## 4. Retours attendus de l'équipe

Pour chaque anomalie, indiquer la **page et l'étape**, le **résultat constaté**, le **résultat attendu**, le **navigateur et l'appareil**, la **langue** et l'**environnement** utilisés. Ajouter au besoin une capture expurgée de toute donnée personnelle.

Après un délai d'attente ou une erreur lors d'une création de commande DEV, **ne pas recommencer automatiquement** : conserver la référence et signaler l'incident.

## 5. Conditions d'intégration et de déploiement

- Conserver la version V5-C **à l'identique** dans `develop` et `main`, avec la présente note dans `docs/`.
- L'intégration GitHub n'autorise **aucun paiement réel** et n'établit aucune validation financière.
- Ne pas activer le checkout public en modifiant les variables `VITE_PDC_V5C29_*` ou les paramètres serveur.
- Ne pas appliquer les migrations `*_dev.sql` à la base de production, ni déployer le webhook DEV en production.
- Contrôler les conséquences des déploiements automatiques Vercel avant la fusion dans `main`.
- L'authentification fournisseur, le rapprochement financier, les écritures de confirmation, l'arrondi EUR/XAF et la reprise sur incident seront abordés en **V5-C.42**.

**Objectif de cette revue :** permettre aux collègues de parcourir l'ensemble de V5-C et de relever les défauts sans engager la moindre transaction financière réelle.
