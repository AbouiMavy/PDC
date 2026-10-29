#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."

read -r -p "Project Ref Supabase DEV : " REF
read -r -p "businessId TaraMoney commun : " BID

if [[ ! "$REF" =~ ^[a-z0-9]{20}$ ]] ||
   [[ ! "$BID" =~ ^[A-Za-z0-9_-]{1,128}$ ]]; then
  echo "Identifiants invalides."
  exit 1
fi

DIR="$HOME/.config/pdc-dev"
mkdir -p "$DIR"
chmod 700 "$DIR"

TOKEN="$DIR/v5c41-webhook-token"

if [[ ! -s "$TOKEN" ]]; then
  openssl rand -hex 32 > "$TOKEN"
  chmod 600 "$TOKEN"
fi

printf '%s' "$REF" > "$DIR/v5c41-project-ref"
chmod 600 "$DIR/v5c41-project-ref"

TEMP="$(mktemp)"
trap 'rm -f "$TEMP"' EXIT
chmod 600 "$TEMP"

printf 'PDC_TARA_WEBHOOK_TOKEN=%s\n' \
  "$(cat "$TOKEN")" > "$TEMP"
printf 'PDC_TARA_BUSINESS_ID=%s\n' \
  "$BID" >> "$TEMP"

echo "Publication des secrets dans Supabase DEV..."
npx --yes supabase@latest secrets set \
  --env-file "$TEMP" \
  --project-ref "$REF"

rm -f "$TEMP"

echo "Deploiement de la fonction HTTPS..."
npx --yes supabase@latest functions deploy \
  pdc-tara-webhook \
  --project-ref "$REF" \
  --no-verify-jwt \
  --use-api

echo "Webhook deploye pour le projet Supabase DEV."
echo "Jeton et URL complete conserves hors Git."
