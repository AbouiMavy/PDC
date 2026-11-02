# PDC V5-C — Adhérer : mêmes moyens de paiement que Soutenir

**Branche :** `feature/v5c`. **Statut :** interface de démonstration, pas de paiement activé.

## Installation

Téléverser ce ZIP dans `/workspaces/PDC-v5c`, puis depuis ce répertoire :

```bash
unzip -n pdc_v5c_payment_modes.zip
python3 scripts/apply-adhesion-payment-modes-v5c.py
node --test tests/v5c-payment-modes-parity.test.mjs
npm test --prefix backend/pdc-api
npm run build
git diff --check
git status --short
```

Le script échoue sans écrire si les ancres des fichiers ne correspondent pas à la version attendue. Il est idempotent.

## Ce qui change

- `src/components/PaymentMethods/PaymentMethods.jsx` mutualise le composant de choix et le RIB pour **Soutenir** et **Adhérer**.
- `src/pages/Adhesion.jsx` ajoute le mode de paiement choisi, la sous-option WhatsApp/Telegram et le récapitulatif.
- `src/components/DonForm/DonForm.jsx` utilise le composant commun sans modifier la logique de dons.
- Les quatre choix restent Mobile Money, Tara messagerie, carte/portefeuilles numériques, virement.
- Aucun paiement déclenché, aucune modification SQL, aucune donnée envoyée.

## Avant la connexion des briques backend

Ne PAS utiliser systématiquement `generalLink` : il mène à la page multi-moyens Tara. Vérifier les liens spécifiques réellement retournés (`cardLink`, `whatsappLink`, `telegramLink`) ainsi que les schémas/URLs exacts, et demander le contrat Tara pour le Mobile Money direct. Le virement reste hors Tara. La carte passe par Stripe selon le libellé actuel du formulaire Soutenir, sous réserve des arbitrages fournisseur à venir. Aucun fallback silencieux vers la page multi-moyens lorsque la personne a choisi un canal spécifique.

**Attention :** les coordonnées bancaires sont celles de Soutenir, sans modification ni validation nouvelle ; elles doivent être confirmées par le trésorier avant tout usage réel.
