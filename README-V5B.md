# PDC — Itération V5-B (socle central, sans activation)

Ce ZIP **ne remplace aucun fichier existant du portail**. Il ajoute :
- une migration SQL dans `supabase/migrations/` ;
- des fonctions de calcul pur côté JavaScript ;
- des tests Node.js (dont conversion sécurisée EUR/XAF) ;
- une documentation de sécurité ;
- un exemple de noms de secrets **sans clé réelle**.

## Installer dans le Codespace
Travaillez sur `dev-alexandre` (conservez `develop` et `main` inchangés). Vérifiez `git status --short` avant l'extraction. Déposez le ZIP à la racine du projet, puis :

```bash
unzip -n pdc-v5b-socle-centralise.zip
node --test tests/registre-v5b.test.mjs tests/structure-v5b.test.mjs
npm run build
```

**Ne lancez pas** `supabase db push`, `supabase db reset` ni `supabase link` pour l'instant.

## Pourquoi commencer par la migration sans brancher les formulaires ?
Le portail V5-A.4 fonctionne en simulation. Brancher des formulaires de militants à une base distante avant de connaître son administration, ses règles d'accès et son environnement de test présenterait un risque de divulgation de données politiques. La V5-B prépare d'abord les modèles et les contrôles.

## Validation attendue avant activation
1. Créer un projet **Supabase de développement distinct de la production**, sous la gouvernance du PDC.
2. Faire examiner la migration et les permissions de chaque table.
3. Tester les contraintes et les écritures concurrentes sur un PostgreSQL local/de test.
4. Construire des endpoints Node.js / fonctions serveur avec authentification et validation.
5. Tester avec des personnes **fictives** et des événements de paiement synthétiques.
6. Faire autoriser la collecte réelle, puis activer graduellement les modules.

## Code actuel et compatibilité
- Ne modifie pas `src/App.jsx`, `Navbar.jsx`, `Adhesion.jsx` ni `DonForm.jsx`.
- Réutilise les mêmes devises (XAF/EUR) et catégories Cameroun connues de la V5-A.
- L'année de cotisation est enregistrée explicitement et non déduite d'un paiement.
- L'identifiant militant reste distinct de l'identifiant interne UUID.
- La solution future peut accueillir des rôles territoriaux sans éclater les données.

## À ne pas commettre
Ne jamais ajouter de secrets réels ni de fichiers `.env` ; `config/env.v5b.example` est un exemple entièrement fictif.
