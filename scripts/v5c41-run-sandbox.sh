#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."

ask() {
  local name="$1" label="$2" secret="${3:-false}"
  local value=""

  if [[ -n "${!name:-}" ]]; then
    export "$name"
    return
  fi

  if [[ "$secret" == "true" ]]; then
    read -r -s -p "$label : " value
    printf '\n'
  else
    read -r -p "$label : " value
  fi

  if [[ -z "$value" ]]; then
    echo "Valeur obligatoire manquante." >&2
    exit 1
  fi

  printf -v "$name" '%s' "$value"
  export "$name"
}

echo "=== PDC V5-C.41 : TARAMONEY SANDBOX ==="
echo "Aucune clé ne sera enregistrée dans un fichier."
echo "Ne jamais saisir la clé API Production."

: "${CODESPACE_NAME:?Codespaces requis}"
: "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:?Domaine absent}"

ORIGIN="https://${CODESPACE_NAME}-5174.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"

export PDC_V5C30_ALLOWED_ORIGIN="$ORIGIN"
export PDC_V5C30_TURNSTILE_HOSTNAME="${CODESPACE_NAME}-5174.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
export PDC_V5C30_PROXY_MODE=direct

export PDC_V5C30_DB_CA_FILE="${PDC_V5C30_DB_CA_FILE:-$HOME/.config/pdc-dev/supabase-ca.crt}"

HMAC_FILE="$HOME/.config/pdc-dev/rate-hmac.key"

if [[ ! -f "$PDC_V5C30_DB_CA_FILE" || ! -f "$HMAC_FILE" ]]; then
  echo "Certificat Supabase ou secret HMAC local introuvable."
  echo "Ne pas recréer de secret sans contrôler la configuration V5-C.40."
  exit 1
fi

export PDC_V5C30_RATE_HMAC_SECRET="$(
  tr -d '\r\n' < "$HMAC_FILE"
)"

ask PDC_V5C30_PROJECT_REF \
  "Référence du projet Supabase DEV (20 caractères)"

if [[ -z "${PDC_V5C30_DATABASE_URL:-}" ]]; then
  ask PDC_V5C41_DB_HOST \
    "Hôte du pooler Supabase DEV (aws-...pooler.supabase.com)"

  DB_PORT="${PDC_V5C41_DB_PORT:-5432}"

  read -r -s -p "Mot de passe PostgreSQL du rôle writer : " DB_PASS
  printf '\n'

  if [[ -z "$DB_PASS" ]]; then
    echo "Mot de passe absent."
    exit 1
  fi

  ENCODED_PASS="$(
    printf '%s' "$DB_PASS" |
    python3 -c \
      'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read(),safe=""))'
  )"

  unset DB_PASS

  export PDC_V5C30_DATABASE_URL="postgresql://pdc_tara_v5c_writer.${PDC_V5C30_PROJECT_REF}:${ENCODED_PASS}@${PDC_V5C41_DB_HOST}:${DB_PORT}/postgres"

  unset ENCODED_PASS
fi

ask PDC_V5C30_TURNSTILE_SECRET \
  "Clé secrète Cloudflare Turnstile DEV" true

ask PDC_V5C41_TARA_BUSINESS_ID \
  "businessId TaraMoney (identique Sandbox / Production)"

ask PDC_V5C41_TARA_SANDBOX_API_KEY \
  "Clé API TaraMoney SANDBOX uniquement" true

ask PDC_V5C41_WEBHOOK_URL \
  "URL HTTPS publique du webhook PDC destiné à TaraMoney" true

read -r -p \
  "Confirmer que la clé saisie est bien la clé SANDBOX (oui/non) : " \
  CONFIRMATION

if [[ "$CONFIRMATION" != "oui" ]]; then
  echo "Activation annulée."
  exit 1
fi

export PDC_V5C41_ENABLED=true
export PDC_V5C41_MODE=sandbox
export PDC_V5C41_ISSUE_LINKS=true
export PDC_V5C41_SANDBOX_KEY_CONFIRMED=true

echo "Démarrage de l'API V5-C.41 sur le port privé 8789."

exec node backend/pdc-api/scripts/start-public-sandbox-v5c41.mjs
