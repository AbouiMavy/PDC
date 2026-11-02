# R5.1 — Consentement couple par courriel et don conditionnel (DEV)

## Arbitrage du 30 octobre 2026

La déclaration `consentPartenaire` préexistante **n'est pas supprimée**. L'adhésion couple diaspora exige désormais, en plus, une **case indépendante** `accepteConversionDon` (décochée par défaut) : le payeur autorise expressément la requalification de **40 € = 30 € de cotisation individuelle + 10 € de don sans remboursement** si le deuxième bénéficiaire refuse ou ne confirme pas par courriel dans les **14 jours**. Ce changement ne concerne ni le tarif à 15 €, ni celui à 30 €, ni les adhésions camerounaises.

**Paiement autorisé avant confirmation du partenaire**, mais aucun numéro, admission ou carte pour celui-ci tant que sa confirmation personnelle n'est pas enregistrée. Ne jamais déduire le paiement de l'URL de retour Tara.

## Parcours

1. Le demandeur renseigne le partenaire, coche l'**attestation préexistante** et l'**autorisation du don conditionnel**, accepte les textes du PDC et enregistre la demande.
2. Le serveur vérifie la case et les trois tarifs sur la base du barème existant. La base conserve l'instant d'acceptation et la version `R5-1-14J-30-10`.
3. Le serveur crée un lien à jeton aléatoire **à usage unique** (256 bits, seule l'empreinte SHA-256 est en base) et envoie une invitation au courriel du partenaire via l'adaptateur transactionnel Resend. L'invitation peut partir lors de la création du dossier, même si le paiement n'est pas encore confirmé : il ne faut pas la confondre avec la preuve d'encaissement.
4. Le demandeur peut procéder au paiement unique de 40 € sans attendre. **Un seul paiement** en XAF, au taux PDC existant de 656 FCFA/€ ; **aucun faux paiement en EUR**.
5. Le partenaire ouvre la page `/adhesion/confirmer-partenaire` et choisit volontairement de **confirmer** (après case de consentement sur la page) ou **refuser**. Une simple ouverture du lien n'engage aucune adhésion.
6. Après paiement **indépendamment vérifié** : si le partenaire confirme à temps, les deux dossiers peuvent être instruits selon les règles d'admission R5 ; s'il refuse ou demeure silencieux 14 jours, un opérateur habilité exécute `pdc_private.r5_regularize_couple_dev(order_id,operator)` dans SQL Editor DEV.
7. La régularisation produit un **registre EUR 30/10** adossé à l'unique paiement XAF confirmé, requalifie le dossier du payeur en cotisation individuelle, annule le dossier provisoire du partenaire et rend possible une admission individuelle sous contrôle administratif. Pas de remboursement, pas de versement double, pas de don sans case expresse.

## Cas d'échec / limites

- Le paiement n'est jamais réputé effectué au seul retour TaraMoney. Sans vérification dashboard, aucune reclassification 30/10.
- Sans email réellement remis au prestataire, l'interface indique `delivery_requires_review` et ne prétend pas à un envoi réussi. Une intervention de support est requise ; aucun nouveau jeton ni email ne sont générés automatiquement après incident incertain.
- Si le partenaire confirme, sa candidature reste soumise à examen politique et administratif. Confirmation ne signifie pas admission.
- En l'absence de confirmation sous 14 jours, **la régularisation reste une action administrative DEV**, pas un batch périodique déployé. Une automatisation planifiée ne devra être activée qu'après recette et choix explicite de l'ordonnanceur.
- Cette migration 04600 est la version R5.1 pour **une base où l'ancienne 04600 n'a pas été appliquée**. Si la 04600 précédente est déjà installée, **NE PAS la réexécuter** : adapter par une migration incrémentale et audit préalable.

## Secrets courriel DEV (runtime serveur uniquement)

- `PDC_R51_RESEND_API_KEY` — clé transactionnelle serveur ; jamais `VITE_`.
- `PDC_R51_EMAIL_FROM` — expéditeur d'un domaine vérifié auprès du fournisseur.
- L'envoi utilise `POST https://api.resend.com/emails` et `Idempotency-Key`. Vérifier les obligations de protection des données et les conditions de sous-traitance avant usage réel.
- Vérifier la réception réelle sur des adresses fictives de test autorisées, et les liens à usage unique, expiration, refus, double clic, concurrentiel.

## Validation

Tests unitaires : `node --test backend/pdc-api/test/r5-consolide.test.mjs`. Ensuite `npm run build`, tests historiques et audit SQL en transaction ROLLBACK. **Aucun envoi réel ni paiement n'est déclenché par l'installateur ni par les tests unitaires.** La recette SQL de la migration et du traitement administratif doit encore être effectuée en Supabase DEV.
