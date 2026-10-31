#!/usr/bin/env bash
# PDC R5.1 — lanceur Codespaces DEV, sans stockage des secrets.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

ask() {
  local name="$1" label="$2" secret="${3:-false}" value=""
  if [[ -n "${!name:-}" ]]; then export "$name"; return; fi
  if [[ "$secret" == true ]]; then
    read -r -s -p "$label : " value; printf '\n'
  else
    read -r -p "$label : " value
  fi
  [[ -n "$value" ]] || { echo "Paramètre obligatoire absent : $name" >&2; exit 1; }
  printf -v "$name" '%s' "$value"
  export "$name"
}

[[ "${CODESPACES:-}" == true && "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" == app.github.dev ]] || {
  echo 'Codespaces app.github.dev requis.' >&2; exit 1;
}
: "${CODESPACE_NAME:?Nom du Codespace absent}"
REF='rvgpnmznhzwlzqyefahd'
ORIGIN="https://${CODESPACE_NAME}-5174.app.github.dev"
HOST="${CODESPACE_NAME}-5174.app.github.dev"
export PDC_R5_ENABLED=true PDC_R5_MODE=sandbox PDC_R5_LINKS_ENABLED=true
export PDC_R5_PROJECT_REF="$REF" PDC_R5_ALLOWED_ORIGIN="$ORIGIN" PDC_R5_TURNSTILE_HOSTNAME="$HOST"
export PDC_V5C30_DB_CA_FILE="${PDC_V5C30_DB_CA_FILE:-$HOME/.config/pdc-dev/supabase-ca.crt}"
HMAC_FILE="$HOME/.config/pdc-dev/rate-hmac.key"
[[ -s "$PDC_V5C30_DB_CA_FILE" && -s "$HMAC_FILE" ]] || {
  echo 'Certificat TLS ou HMAC existant introuvable. Ne pas les régénérer.' >&2; exit 1;
}
export PDC_V5C30_RATE_HMAC_SECRET="$(tr -d '\r\n' < "$HMAC_FILE")"

ask PDC_V5C41_DB_HOST 'Hôte du pooler Supabase DEV (aws-...pooler.supabase.com)'
DB_PORT="${PDC_V5C41_DB_PORT:-5432}"
[[ "$DB_PORT" == 5432 || "$DB_PORT" == 6543 ]] || { echo 'Port pooler non autorisé.' >&2; exit 1; }
[[ "$PDC_V5C41_DB_HOST" =~ ^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$ ]] || {
  echo 'Hôte du pooler invalide.' >&2; exit 1;
}

make_db_url() {
  local output="$1" role="$2" label="$3" pass='' encoded=''
  if [[ -n "${!output:-}" ]]; then export "$output"; return; fi
  read -r -s -p "$label : " pass; printf '\n'
  [[ -n "$pass" ]] || { echo "Mot de passe absent pour $role" >&2; exit 1; }
  encoded="$(printf '%s' "$pass" | python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read(),safe=""))')"
  unset pass
  printf -v "$output" 'postgresql://%s.%s:%s@%s:%s/postgres' "$role" "$REF" "$encoded" "$PDC_V5C41_DB_HOST" "$DB_PORT"
  unset encoded
  export "$output"
}

make_db_url PDC_V5C30_DATABASE_URL pdc_tara_v5c_writer 'Mot de passe du rôle V5C writer existant'
make_db_url PDC_R5_INTAKE_DATABASE_URL pdc_r5_intake_writer 'Mot de passe du rôle R5 intake writer'
make_db_url PDC_R5_PHOTO_DATABASE_URL pdc_r5_photo_writer 'Mot de passe du rôle R5 photo writer'

ask PDC_R5_TURNSTILE_SECRET 'Clé secrète Turnstile DEV' true
ask PDC_R5_STORAGE_SERVICE_KEY 'Clé service_role Supabase DEV (backend uniquement)' true
ask PDC_R5_TARA_BUSINESS_ID 'businessId TaraMoney SANDBOX'
ask PDC_R5_TARA_SANDBOX_API_KEY 'Clé API TaraMoney SANDBOX (jamais Production)' true
ask PDC_R5_WEBHOOK_URL 'URL HTTPS webhook TaraMoney déjà configurée'
ask PDC_R51_RESEND_API_KEY 'Clé API Resend' true
export PDC_R51_EMAIL_FROM="${PDC_R51_EMAIL_FROM:-onboarding@resend.dev}"

printf '\nATTENTION : vérifiez que la clé TaraMoney est bien celle du SANDBOX.\n'
read -r -p 'Confirmer SANDBOX (oui/non) : ' CONFIRMATION
[[ "$CONFIRMATION" == oui ]] || { echo 'Démarrage annulé.' >&2; exit 1; }
export PDC_R5_SANDBOX_KEY_CONFIRMED=true

echo 'Démarrage R5.1 DEV sur 127.0.0.1:8790 ; aucune confirmation automatique de paiement.'
exec node backend/pdc-api/scripts/start-r5-sandbox.mjs
