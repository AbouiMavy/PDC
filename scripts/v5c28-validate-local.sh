#!/usr/bin/env bash
# A lancer à la racine de Codespaces après extraction du ZIP.
# Ne contacte ni Supabase ni Tara et ne déploie rien.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
printf '\n== 1/5 Structure attendue des migrations et modules ==\n'
node scripts/v5c28-preflight.mjs .
printf '\n== 2/5 Tests du contrôle V5-C.28 ==\n'
node --test tests/v5c28-preflight.test.mjs
printf '\n== 3/5 Régressions backend ==\n'
npm test --prefix backend/pdc-api
printf '\n== 4/5 Régressions frontend ==\n'
node --test tests/*.test.mjs
printf '\n== 5/5 Build frontend et état Git ==\n'
npm run build
git diff --check
git status --short
printf '\nOK LOCAL uniquement. Prochaine étape distincte : contrôles SQL manuels sur Supabase DEV.\n'
