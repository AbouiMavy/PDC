
## 31 octobre 2026 — Validation visuelle du parcours diaspora R5.1

Environnement : GitHub Codespaces, branche feature/v5c44.
Mode : Sandbox DEV exclusivement.

### Corrections réalisées
- Variables frontend VITE_PDC_R5_* ajoutées dans .env.local.
- Proxy R5 ajouté dans vite.config.js vers 127.0.0.1:8790.
- Configuration V5-C existante préservée.
- Origine API frontend corrigée vers l'URL HTTPS Codespaces du port 5174.
- Serveur Vite redémarré.

### Contrôles techniques
- Vérification de syntaxe de vite.config.js : réussie.
- Contrôle git diff --check : réussi.
- Requête OPTIONS sur /v1/public/r5/diaspora : HTTP 204.
- Requête POST avec corps JSON vide : HTTP 400 INVALID_REQUEST.
- Ces contrôles ne prouvent pas encore la réussite d'une adhésion complète.

### Validation visuelle confirmée
- Bloc « Dossier diaspora — Sandbox DEV » affiché.
- Cloudflare Turnstile affiche « Succès ! ».
- Dossier de test : 30 EUR.
- Référence de conversion affichée : 1 EUR = 656 FCFA.
- Canal sélectionné : TaraMoney, lien par WhatsApp.
- Action affichée : « Enregistrer le dossier et préparer le paiement ».
- Mention explicite : aucun paiement confirmé par cette page.
- Vérification financière et admission maintenues séparées.

### Reste à tester
- Enregistrement effectif du dossier dans Supabase DEV.
- Gestion des éventuels consentements et portraits.
- Génération du lien TaraMoney Sandbox pour ce dossier.
- Réception des courriels applicables.
- Contrôles de non-régression et absence de confirmation automatique.

### Sécurité et conservation
- Aucun secret reproduit dans ce document.
- .env.local doit rester ignoré par Git.
- Ce dossier de suivi reste local : ne jamais le committer ni le pousser.

## 31 octobre 2026 — Validation visuelle du parcours diaspora R5.1

Environnement : GitHub Codespaces, branche feature/v5c44.
Mode : Sandbox DEV exclusivement.

### Corrections réalisées
- Variables frontend VITE_PDC_R5_* ajoutées dans .env.local.
- Proxy R5 ajouté dans vite.config.js vers 127.0.0.1:8790.
- Configuration V5-C existante préservée.
- Origine API frontend corrigée vers l'URL HTTPS Codespaces du port 5174.
- Serveur Vite redémarré.

### Contrôles techniques
- Vérification de syntaxe de vite.config.js : réussie.
- Contrôle git diff --check : réussi.
- Requête OPTIONS sur /v1/public/r5/diaspora : HTTP 204.
- Requête POST avec corps JSON vide : HTTP 400 INVALID_REQUEST.
- Ces contrôles ne prouvent pas encore la réussite d'une adhésion complète.

### Validation visuelle confirmée
- Bloc « Dossier diaspora — Sandbox DEV » affiché.
- Cloudflare Turnstile affiche « Succès ! ».
- Dossier de test : 30 EUR.
- Référence de conversion affichée : 1 EUR = 656 FCFA.
- Canal sélectionné : TaraMoney, lien par WhatsApp.
- Action affichée : « Enregistrer le dossier et préparer le paiement ».
- Mention explicite : aucun paiement confirmé par cette page.
- Vérification financière et admission maintenues séparées.

### Reste à tester
- Enregistrement effectif du dossier dans Supabase DEV.
- Gestion des éventuels consentements et portraits.
- Génération du lien TaraMoney Sandbox pour ce dossier.
- Réception des courriels applicables.
- Contrôles de non-régression et absence de confirmation automatique.

### Sécurité et conservation
- Aucun secret reproduit dans ce document.
- .env.local doit rester ignoré par Git.
- Ce dossier de suivi reste local : ne jamais le committer ni le pousser.
