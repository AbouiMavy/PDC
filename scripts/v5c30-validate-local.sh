#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo '== V5-C.30 tests sécurité / contrôle HTTP =='
node --test backend/pdc-api/test/v5c30-*.test.mjs
echo '== Régressions backend =='
(cd backend/pdc-api && npm test)
echo '== Régressions frontend =='
node --test tests/*.test.mjs
echo '== Compilation Vite =='
npm run build
echo '== Vérification diff =='
git diff --check
echo '== État Git =='
git status --short
echo 'TESTS LOCAUX TERMINÉS : pas de base DEV ni de fournisseur appelés.'
