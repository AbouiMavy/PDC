#!/usr/bin/env bash
# V5-C.44 : contrôle opérateur exclusivement en lecture, sans écriture.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
if [[ "$(git branch --show-current)" != "feature/v5c44" ]]; then
  echo 'ERREUR : branche feature/v5c44 requise.' >&2; exit 1
fi

MODE="${1:-mock}"
case "$MODE" in
  mock)
    SCENARIO="${2:-missing}"
    exec node backend/pdc-api/scripts/audit-readonly-v5c44.mjs \
      --mode=mock "--scenario=${SCENARIO}"
    ;;
  db-only|provider-read)
    if [[ "${CODESPACES:-}" != 'true' || \
          "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" != 'app.github.dev' ]]; then
      echo 'ERREUR : environnement Codespaces DEV requis.' >&2; exit 1
    fi
    export PDC_V5C30_PROJECT_REF='rvgpnmznhzwlzqyefahd'
    export PDC_V5C30_DB_CA_FILE="${PDC_V5C30_DB_CA_FILE:-$HOME/.config/pdc-dev/supabase-ca.crt}"
    if [[ ! -r "$PDC_V5C30_DB_CA_FILE" ]]; then
      echo 'ERREUR : certificat Supabase DEV introuvable.' >&2; exit 1
    fi
    read -r -p 'productId de commande DEV : ' PRODUCT_ID
    if [[ ! "$PRODUCT_ID" =~ ^PDC_[A-Za-z0-9_-]{24}$ ]]; then
      echo 'ERREUR : format productId inattendu.' >&2; exit 1
    fi
    if [[ -z "${PDC_V5C30_DATABASE_URL:-}" ]]; then
      read -r -p 'Hôte pooler Supabase DEV : ' DB_HOST
      if [[ ! "$DB_HOST" =~ ^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$ ]]; then
        echo 'ERREUR : hôte pooler Supabase invalide.' >&2; exit 1
      fi
      read -r -s -p 'Mot de passe PostgreSQL writer : ' DB_PASS
      printf '\n'
      if [[ -z "$DB_PASS" ]]; then echo 'Mot de passe absent.' >&2; exit 1; fi
      ENCODED_PASS="$(printf '%s' "$DB_PASS" | python3 -c \
        'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read(),safe=""))')"
      unset DB_PASS
      export PDC_V5C30_DATABASE_URL="postgresql://pdc_tara_v5c_writer.${PDC_V5C30_PROJECT_REF}:${ENCODED_PASS}@${DB_HOST}:5432/postgres"
      unset ENCODED_PASS DB_HOST
    fi
    if [[ "$MODE" == 'provider-read' ]]; then
      echo 'Consultation des API de statut/liste TaraMoney uniquement.'
      echo 'Aucun lien créé ; aucun paiement effectué ; aucune confirmation SQL.'
      read -r -p 'Confirmer clé SANDBOX et lecture fournisseur (oui/non) : ' CONFIRM
      [[ "$CONFIRM" == 'oui' ]] || { echo 'Annulé.'; exit 1; }
      export PDC_V5C44_APPROVED_READONLY=oui
      export PDC_V5C44_TARA_SANDBOX_KEY_CONFIRMED=oui
      if [[ -z "${PDC_V5C44_TARA_BUSINESS_ID:-}" ]]; then
        read -r -p 'businessId marchand TaraMoney : ' PDC_V5C44_TARA_BUSINESS_ID
        export PDC_V5C44_TARA_BUSINESS_ID
      fi
      if [[ -z "${PDC_V5C44_TARA_SANDBOX_API_KEY:-}" ]]; then
        read -r -s -p 'Clé API TaraMoney SANDBOX : ' PDC_V5C44_TARA_SANDBOX_API_KEY
        printf '\n'
        export PDC_V5C44_TARA_SANDBOX_API_KEY
      fi
      node backend/pdc-api/scripts/audit-readonly-v5c44.mjs \
        --mode=provider-read --allow-provider-read "--product-id=${PRODUCT_ID}"
    else
      node backend/pdc-api/scripts/audit-readonly-v5c44.mjs \
        --mode=db-only "--product-id=${PRODUCT_ID}"
    fi
    unset PRODUCT_ID PDC_V5C30_DATABASE_URL PDC_V5C44_TARA_SANDBOX_API_KEY \
      PDC_V5C44_TARA_BUSINESS_ID PDC_V5C44_APPROVED_READONLY \
      PDC_V5C44_TARA_SANDBOX_KEY_CONFIRMED
    ;;
  *) echo 'Usage : bash scripts/v5c44-audit-dev.sh mock [scenario] | db-only | provider-read' >&2; exit 1;;
esac
