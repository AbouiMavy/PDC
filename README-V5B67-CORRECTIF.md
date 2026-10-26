# PDC — Atelier V5-B.6.7 : deux rectos, devise officielle DÉMOCRATIE

## Pourquoi ce correctif ?
L'atelier livré précédemment chargeait uniquement le **recto diaspora** et les quatre champs de « secteurs ». Or le PDC possède **deux cartes** distinctes, avec **un verso commun**.

## Ce que le correctif fait

- **Sélecteur « Modèle de carte »** : Cameroun ou Diaspora, dans `/carte-dev.html`.
- **Cameroun** : son recto d'origine, avec les rubriques *Conseil régional / Conseil départemental / Comité d'arrondissement / Chambre*.
- **Diaspora** : son autre recto d'origine, avec les rubriques *Secteur continental / Secteur national / Secteur régional / Secteur de base*.
- **Un seul verso PDC**, fichier fourni conservé **strictement à l'identique**. L'atelier le partage automatiquement entre les deux catégories.
- **Respect strict de la devise des deux rectos officiels fournis : « DIEU - PATRIE - JUSTICE - DÉMOCRATIE / GOD - FATHERLAND - JUSTICE - DEMOCRACY »**. Aucun recouvrement, aucune réécriture de la devise par Canvas.
- Le changement de catégorie change simultanément le **fond du recto, les libellés et les valeurs fictives**, en mémorisant les dernières valeurs saisies par catégorie.
- Exports nommés spécifiquement `PDC_CAMEROUN...` ou `PDC_DIASPORA...`.
- Photo locale facultative, numéro de test M/F à six chiffres, filigrane « SPÉCIMEN » et QR non actif conservés.

## Provenance des images utilisées

Il n'y a **aucune image générée par IA** dans ce correctif. Seuls sont copiés, sans retouche, les fichiers transmis par le PDC dans la conversation :

- `modele-recto-cameroun.png` — recto Cameroun transmis.
- `modele-recto-diaspora.png` — recto Diaspora transmis.
- `modele-verso-officiel.png` — verso commun précédemment transmis.

Les deux rectos PNG originaux sont reproduits **octet pour octet** à partir des nouvelles pièces jointes ; leur devise est conservée dans la prévisualisation et dans l'export. Aucune image nouvelle n'est générée. Le verso ne reçoit **aucun nouveau texte**, aucune nouvelle signature ni photographie.

## Installer sur feature/v5b, sans arrêter les ports

Déposer le ZIP à la racine du dépôt, puis dans Codespaces :

```bash
cd /workspaces/PDC
git switch feature/v5b
mkdir -p .pdc-v5b67-backup
cp carte-dev.html src/features/cartes-dev/carte-specimen.mjs src/features/cartes-dev/demo.mjs .pdc-v5b67-backup/
unzip -o pdc-v5b67-atelier-devise-democratie.zip
node --test tests/v5b67-cartes-specimens.test.mjs
npm run build
```

Actualiser `http://127.0.0.1:5173/carte-dev.html` sans relancer le port 5173. Basculer successivement de **Cameroun** à **Diaspora** et vérifier les champs et le modèle affichés, puis comparer le verso des deux variantes : il doit être identique.

## Limites

Ce correctif ne modifie ni `/adhesion`, ni `/soutenir`, ni les neuf migrations Supabase, ni l'API, ni les droits administratifs.

L'atelier reste **strictement un outil de spécimens fictifs** : aucun dossier personnel, aucun numéro réel, aucune carte officielle délivrée. La vérification visuelle dans Codespaces reste nécessaire avant validation définitive.

## Correctif supplémentaire

Le précédent correctif remplaçait à tort « DÉMOCRATIE / DEMOCRACY » par « ÉGALITÉ / EQUALITY » sur les rectos. Cette version supprime totalement cet écrasement graphique. **Ne pas installer l’ancien ZIP** ; utiliser celui-ci directement.
