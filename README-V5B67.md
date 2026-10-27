# PDC — V5-B.6.7 : générateur local de spécimens de cartes numériques

**Portée :** uniquement `feature/v5b` et Codespaces, environnement de développement. **Aucun `db push`, aucune migration n°10, aucune écriture ou lecture Supabase.** Les neuf migrations actuelles et les parcours d'adhésion/dons restent inchangés.

## Livrables

- `carte-dev.html` : atelier autonome de démonstration accessible sur le Vite public (port 5173), **non lié à la navigation du site**.
- `src/features/cartes-dev/carte-specimen.mjs` : composition locale par Canvas sur les **deux images originales** fournies par le PDC (1011 × 639 pixels) ; civilité Madame/Monsieur → M/F ; six chiffres fictifs ; champs du recto ; téléchargement recto et verso en PNG.
- `src/features/cartes-dev/demo.mjs` : affichage du spécimen et éventuel portrait JPEG/PNG local (jamais envoyé), prévisualisation et boutons d'export.
- `src/features/cartes-dev/assets/modele-recto-officiel.png`, `modele-verso-officiel.png` : maquettes sources **sans modification**. Attention : le verso contient une signature fournie dans la maquette.
- `tests/v5b67-cartes-specimens.test.mjs` : tests de validation et de non-régression du rendu non officiel.

## Installation dans Codespaces

Depuis la racine `/workspaces/PDC` :

```bash
cd /workspaces/PDC
git switch feature/v5b
unzip -o pdc-v5b67-cartes-specimens.zip
node --test tests/v5b67-cartes-specimens.test.mjs
npm run build
```

Ensuite, **sans redémarrer le port** s'il tourne déjà, ouvrir l'adresse existante du site 5173 en remplaçant le chemin par `/carte-dev.html` (par exemple `http://127.0.0.1:5173/carte-dev.html`). Les tests du formulaire et les fichiers backend ne sont pas modifiés.

**Ne pas utiliser de vraies identités ni de photos personnelles pour cet atelier.** Les fichiers PNG de démonstration portent le filigrane rouge `SPÉCIMEN — CARTE NON VALIDE` et le QR/code-barres d'origine sont recouverts par des mentions `NON ACTIF`.

## Limites et prochaine itération

1. **Aucune carte réelle** n'est générée ou délivrée, même lorsqu'une photo est fournie. Le numéro saisi ici est fictif et ne réserve rien dans la base.
2. L'édition des secteurs territorial/national/régional/de base est libre dans cet atelier afin de visualiser la maquette ; leur nomenclature définitive sera raccordée au registre PDC ultérieurement.
3. Pour une vraie génération, l'API devra vérifier l'authentification, le statut `membership_card_requests='reviewed'`, l'adhésion encore active et sa revue hebdomadaire clôturée, puis générer un **jeton opaque non prédictible**. Le QR futur ne divulguera aucune donnée personnelle ; un endpoint public renverra seulement `valide/invalide` sans exposer nom, photo ou date de naissance.
4. Le stockage des photos devra utiliser un espace privé avec restrictions fortes, sans URL publique permanente. Le code actuel ne collecte ni ne stocke aucune photo sur le serveur.
5. Les autorisations d'émission, journal d'audit, délivrance réelle et statut « définitif » nécessitent une itération distincte et un arbitrage préalable pour les adhésions sans carte.
6. Cette page est **un prototype de développement**. Les modèles sont volontairement conservés dans `src/features/cartes-dev/assets/`, et non dans `public/` : ils ne seront pas copiés automatiquement dans le `dist` du site principal tant que la page démo n'est pas intégrée au build. Avant la publication, écarter cette page démo de toute configuration multi-page et préserver les sources originales dans un stockage interne sécurisé. Aucun lien `main`/Vercel ne doit l'inclure à ce stade.

## Note de sécurité

La maquette source contient un code QR et un code-barres d'illustration, mais ceux-ci ne constituent pas un mécanisme de contrôle de validité. Ils sont intentionnellement masqués dans chaque spécimen téléchargé. Le filigrane est intégré dans le Canvas et ne dépend pas d'un CSS amovible.
