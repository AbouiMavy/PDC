#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
printf '\n== V5-C.29 tests du lot ==\n'
node --test tests/v5c29-*.test.mjs backend/pdc-api/test/v5c29-*.test.mjs
printf '\n== Régressions backend ==\n'
npm test --prefix backend/pdc-api
printf '\n== Régressions frontend ==\n'
node --test tests/*.test.mjs
printf '\n== Build Vite ==\n'
npm run build
printf '\n== Diff sans espaces erronés ==\n'
git diff --check
printf '\n== État Git ==\n'
git status --short
printf '\nSUCCÈS LOCAL. AUCUN PAIEMENT / SQL / DEPLOIEMENT EXECUTÉ.\n'
