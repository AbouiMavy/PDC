#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

DIR="$HOME/.config/pdc-dev"
REF_FILE="$DIR/v5c41-project-ref"
TOKEN_FILE="$DIR/v5c41-webhook-token"

if [[ ! -s "$REF_FILE" || ! -s "$TOKEN_FILE" ]]; then
  echo "Webhook non configure."
  exit 1
fi

REF="$(cat "$REF_FILE")"
TOKEN="$(cat "$TOKEN_FILE")"

export PDC_V5C41_WEBHOOK_URL="https://${REF}.supabase.co/functions/v1/pdc-tara-webhook?token=${TOKEN}"

unset TOKEN

exec bash scripts/v5c41-run-sandbox.sh
