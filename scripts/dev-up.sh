#!/usr/bin/env bash
# PDC DEV — démarrage unifié Codespaces
# Frontend Vite 5174 + Backend Cameroun V5-C.41 8789 + Backend diaspora R5.1 8790
# Les secrets sont saisis en mémoire uniquement et ne sont jamais écrits dans un fichier.
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REF="rvgpnmznhzwlzqyefahd"
DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}"
CODESPACE="${CODESPACE_NAME:-}"

if [[ "${CODESPACES:-}" != "true" || -z "$CODESPACE" || "$DOMAIN" != "app.github.dev" ]]; then
  echo "ERREUR : ce lanceur doit être exécuté dans GitHub Codespaces (*.app.github.dev)." >&2
  exit 1
fi

FRONTEND_PORT=5174
V5C_PORT=8789
R5_PORT=8790

FRONTEND_HOST="${CODESPACE}-${FRONTEND_PORT}.${DOMAIN}"
V5C_HOST="${CODESPACE}-${V5C_PORT}.${DOMAIN}"
R5_HOST="${CODESPACE}-${R5_PORT}.${DOMAIN}"

FRONTEND_URL="https://${FRONTEND_HOST}"
V5C_URL="https://${V5C_HOST}"
R5_URL="https://${R5_HOST}"

STATE_DIR="${HOME}/.cache/pdc-dev"
LOG_DIR="${STATE_DIR}/logs"
PID_DIR="${STATE_DIR}/pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

LOG_FRONTEND="${LOG_DIR}/frontend-5174.log"
LOG_V5C="${LOG_DIR}/v5c41-8789.log"
LOG_R5="${LOG_DIR}/r5-8790.log"

for cmd in ss curl python3 node npm nohup; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "ERREUR : commande requise absente : $cmd" >&2
    exit 1
  }
done

port_listening() {
  local port="$1"
  ss -ltnH 2>/dev/null | awk -v p=":${port}" '$4 ~ p"$" {found=1} END{exit !found}'
}

frontend_healthy() {
  curl -fsS --max-time 3 "http://127.0.0.1:${FRONTEND_PORT}/" >/dev/null 2>&1
}

v5c_healthy() {
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 \
    -X OPTIONS \
    -H "Origin: ${FRONTEND_URL}" \
    "http://127.0.0.1:${V5C_PORT}/v1/public/orders" 2>/dev/null || true)"
  [[ "$code" == "204" || "$code" == "200" ]]
}

r5_healthy() {
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 \
    -X OPTIONS \
    -H "Origin: ${FRONTEND_URL}" \
    "http://127.0.0.1:${R5_PORT}/v1/public/r5/diaspora" 2>/dev/null || true)"
  [[ "$code" == "204" || "$code" == "200" ]]
}

wait_health() {
  local name="$1" check_fn="$2" log_file="$3" timeout="${4:-45}"
  local i
  for ((i=1; i<=timeout; i++)); do
    if "$check_fn"; then
      return 0
    fi
    sleep 1
  done
  echo
  echo "ECHEC : ${name} n'est pas devenu opérationnel en ${timeout}s." >&2
  echo "----- dernières lignes : ${log_file} -----" >&2
  tail -n 40 "$log_file" 2>/dev/null >&2 || true
  return 1
}

ask_value() {
  local var="$1" label="$2"
  local value=""
  if [[ -n "${!var:-}" ]]; then
    return 0
  fi
  read -r -p "${label} : " value
  [[ -n "$value" ]] || { echo "Valeur obligatoire absente : $var" >&2; exit 1; }
  printf -v "$var" '%s' "$value"
  export "$var"
}

ask_secret() {
  local var="$1" label="$2"
  local value=""
  if [[ -n "${!var:-}" ]]; then
    return 0
  fi
  read -r -s -p "${label} : " value
  printf '\n'
  [[ -n "$value" ]] || { echo "Valeur obligatoire absente : $var" >&2; exit 1; }
  printf -v "$var" '%s' "$value"
  export "$var"
}

urlencode() {
  python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read(),safe=""))'
}

make_db_url() {
  local output="$1" role="$2" password_var="$3"
  local encoded
  if [[ -n "${!output:-}" ]]; then
    export "$output"
    return 0
  fi
  encoded="$(printf '%s' "${!password_var}" | urlencode)"
  printf -v "$output" 'postgresql://%s.%s:%s@%s:%s/postgres' \
    "$role" "$REF" "$encoded" "$PDC_DB_HOST" "$PDC_DB_PORT"
  unset encoded
  export "$output"
}

set_env_local_origin() {
  FRONTEND_URL="$FRONTEND_URL" V5C_URL="$V5C_URL" R5_URL="$R5_URL" python3 - <<'PY'
from pathlib import Path
import os, re

p = Path(".env.local")
text = p.read_text() if p.exists() else ""

def put(name, value):
    global text
    pat = rf"^{re.escape(name)}=.*$"
    line = f"{name}={value}"
    if re.search(pat, text, flags=re.M):
        text = re.sub(pat, line, text, count=1, flags=re.M)
    else:
        if text and not text.endswith("\n"):
            text += "\n"
        text += line + "\n"

put("VITE_PDC_V5C29_API_ORIGIN", "")

names = set()
for f in Path("src").rglob("*"):
    if f.suffix not in {".js", ".jsx", ".mjs", ".ts", ".tsx"}:
        continue
    try:
        s = f.read_text(errors="ignore")
    except Exception:
        continue
    names.update(re.findall(r"VITE_PDC_R5[A-Z0-9_]*API_ORIGIN", s))

if not names:
    names.add("VITE_PDC_R5_API_ORIGIN")

for name in sorted(names):
    put(name, os.environ["R5_URL"])

p.write_text(text)
print("Configuration frontend :")
print("  V5C ->", os.environ["V5C_URL"])
for name in sorted(names):
    print(f"  {name} -> {os.environ['R5_URL']}")
PY
}

echo
echo "=== PDC DEV : état initial ==="

V5C_ACTIVE=false
R5_ACTIVE=false
FRONT_ACTIVE=false

if port_listening "$V5C_PORT"; then
  if v5c_healthy; then
    V5C_ACTIVE=true
    echo "8789  V5-C.41 Cameroun : OK — déjà actif"
  else
    echo "8789 est occupé mais le service V5-C.41 ne répond pas correctement." >&2
    echo "Aucun second processus ne sera lancé sur ce port." >&2
    exit 1
  fi
else
  echo "8789  V5-C.41 Cameroun : arrêté"
fi

if port_listening "$R5_PORT"; then
  if r5_healthy; then
    R5_ACTIVE=true
    echo "8790  R5.1 diaspora     : OK — déjà actif"
  else
    echo "8790 est occupé mais le service R5.1 ne répond pas correctement." >&2
    echo "Aucun second processus ne sera lancé sur ce port." >&2
    exit 1
  fi
else
  echo "8790  R5.1 diaspora     : arrêté"
fi

if port_listening "$FRONTEND_PORT"; then
  if frontend_healthy; then
    FRONT_ACTIVE=true
    echo "5174  Frontend Vite     : OK — déjà actif"
  else
    echo "5174 est occupé mais Vite ne répond pas correctement." >&2
    echo "Aucun second processus ne sera lancé sur ce port." >&2
    exit 1
  fi
else
  echo "5174  Frontend Vite     : arrêté"
fi

set_env_local_origin

NEED_V5C=false
NEED_R5=false
[[ "$V5C_ACTIVE" == false ]] && NEED_V5C=true
[[ "$R5_ACTIVE" == false ]] && NEED_R5=true

if [[ "$NEED_V5C" == true || "$NEED_R5" == true ]]; then
  echo
  echo "=== Paramètres backend ==="
  echo "Les secrets restent uniquement en mémoire dans les processus DEV."

  export NODE_ENV=development
  export PDC_V5C30_PROJECT_REF="$REF"
  export PDC_R5_PROJECT_REF="$REF"

  export PDC_V5C30_ALLOWED_ORIGIN="$FRONTEND_URL"
  export PDC_V5C30_TURNSTILE_HOSTNAME="$FRONTEND_HOST"
  export PDC_V5C30_PROXY_MODE=direct

  export PDC_R5_ALLOWED_ORIGIN="$FRONTEND_URL"
  export PDC_R5_TURNSTILE_HOSTNAME="$FRONTEND_HOST"

  export PDC_V5C30_DB_CA_FILE="${PDC_V5C30_DB_CA_FILE:-$HOME/.config/pdc-dev/supabase-ca.crt}"
  HMAC_FILE="${HOME}/.config/pdc-dev/rate-hmac.key"

  [[ -s "$PDC_V5C30_DB_CA_FILE" ]] || {
    echo "Certificat Supabase DEV introuvable : $PDC_V5C30_DB_CA_FILE" >&2
    exit 1
  }
  [[ -s "$HMAC_FILE" ]] || {
    echo "Secret HMAC local introuvable : $HMAC_FILE" >&2
    exit 1
  }
  export PDC_V5C30_RATE_HMAC_SECRET="$(tr -d '\r\n' < "$HMAC_FILE")"

  ask_value PDC_DB_HOST "Hôte du pooler Supabase DEV (aws-...pooler.supabase.com)"
  [[ "$PDC_DB_HOST" =~ ^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$ ]] || {
    echo "Hôte du pooler Supabase invalide." >&2
    exit 1
  }
  PDC_DB_PORT="${PDC_DB_PORT:-5432}"
  [[ "$PDC_DB_PORT" == "5432" || "$PDC_DB_PORT" == "6543" ]] || {
    echo "Port pooler non autorisé : $PDC_DB_PORT" >&2
    exit 1
  }
  export PDC_DB_HOST PDC_DB_PORT
  export PDC_V5C41_DB_HOST="$PDC_DB_HOST"
  export PDC_V5C41_DB_PORT="$PDC_DB_PORT"

  if [[ -z "${PDC_V5C30_DATABASE_URL:-}" ]]; then
    ask_secret PDC_WRITER_DB_PASS "Mot de passe PostgreSQL du rôle pdc_tara_v5c_writer"
    make_db_url PDC_V5C30_DATABASE_URL "pdc_tara_v5c_writer" PDC_WRITER_DB_PASS
    unset PDC_WRITER_DB_PASS
  fi

  ask_secret PDC_COMMON_TURNSTILE_SECRET "Clé secrète Cloudflare Turnstile DEV"
  export PDC_V5C30_TURNSTILE_SECRET="$PDC_COMMON_TURNSTILE_SECRET"
  export PDC_R5_TURNSTILE_SECRET="$PDC_COMMON_TURNSTILE_SECRET"

  ask_value PDC_COMMON_TARA_BUSINESS_ID "businessId TaraMoney SANDBOX"
  export PDC_V5C41_TARA_BUSINESS_ID="$PDC_COMMON_TARA_BUSINESS_ID"
  export PDC_R5_TARA_BUSINESS_ID="$PDC_COMMON_TARA_BUSINESS_ID"

  ask_secret PDC_COMMON_TARA_SANDBOX_API_KEY "Clé API TaraMoney SANDBOX"
  export PDC_V5C41_TARA_SANDBOX_API_KEY="$PDC_COMMON_TARA_SANDBOX_API_KEY"
  export PDC_R5_TARA_SANDBOX_API_KEY="$PDC_COMMON_TARA_SANDBOX_API_KEY"

  ask_secret PDC_COMMON_WEBHOOK_URL "URL HTTPS Supabase pdc-tara-webhook (avec token)"
  case "$PDC_COMMON_WEBHOOK_URL" in
    "https://${REF}.supabase.co/functions/v1/pdc-tara-webhook?token="*) ;;
    *)
      echo "URL webhook inattendue : elle doit pointer vers la fonction Supabase pdc-tara-webhook du projet DEV." >&2
      exit 1
      ;;
  esac
  export PDC_V5C41_WEBHOOK_URL="$PDC_COMMON_WEBHOOK_URL"
  export PDC_R5_WEBHOOK_URL="$PDC_COMMON_WEBHOOK_URL"

  read -r -p "Confirmer TaraMoney SANDBOX (oui/non) : " PDC_CONFIRM_SANDBOX
  [[ "$PDC_CONFIRM_SANDBOX" == "oui" ]] || {
    echo "Démarrage annulé." >&2
    exit 1
  }

  export PDC_V5C41_ENABLED=true
  export PDC_V5C41_MODE=sandbox
  export PDC_V5C41_ISSUE_LINKS=true
  export PDC_V5C41_SANDBOX_KEY_CONFIRMED=true

  export PDC_R5_ENABLED=true
  export PDC_R5_MODE=sandbox
  export PDC_R5_LINKS_ENABLED=true
  export PDC_R5_SANDBOX_KEY_CONFIRMED=true
fi

if [[ "$NEED_R5" == true ]]; then
  if [[ -z "${PDC_R5_INTAKE_DATABASE_URL:-}" ]]; then
    ask_secret PDC_INTAKE_DB_PASS "Mot de passe PostgreSQL du rôle pdc_r5_intake_writer"
    make_db_url PDC_R5_INTAKE_DATABASE_URL "pdc_r5_intake_writer" PDC_INTAKE_DB_PASS
    unset PDC_INTAKE_DB_PASS
  fi

  if [[ -z "${PDC_R5_PHOTO_DATABASE_URL:-}" ]]; then
    ask_secret PDC_PHOTO_DB_PASS "Mot de passe PostgreSQL du rôle pdc_r5_photo_writer"
    make_db_url PDC_R5_PHOTO_DATABASE_URL "pdc_r5_photo_writer" PDC_PHOTO_DB_PASS
    unset PDC_PHOTO_DB_PASS
  fi

  if [[ -z "${PDC_R5_STORAGE_SERVICE_KEY:-}" ]]; then
    if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
      export PDC_R5_STORAGE_SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
    else
      ask_secret PDC_R5_STORAGE_SERVICE_KEY "Clé service_role Supabase DEV (backend uniquement)"
    fi
  fi

  ask_secret PDC_R51_RESEND_API_KEY "Clé API Resend DEV"
  export PDC_R51_EMAIL_FROM="${PDC_R51_EMAIL_FROM:-onboarding@resend.dev}"
fi

echo
echo "=== Démarrage des services manquants ==="

if [[ "$NEED_V5C" == true ]]; then
  : > "$LOG_V5C"
  nohup node backend/pdc-api/scripts/start-public-sandbox-v5c41.mjs \
    >>"$LOG_V5C" 2>&1 &
  echo $! > "${PID_DIR}/v5c41.pid"
  echo "8789  V5-C.41 lancé — log : $LOG_V5C"
fi

if [[ "$NEED_R5" == true ]]; then
  : > "$LOG_R5"
  nohup node backend/pdc-api/scripts/start-r5-sandbox.mjs \
    >>"$LOG_R5" 2>&1 &
  echo $! > "${PID_DIR}/r5.pid"
  echo "8790  R5.1 lancé    — log : $LOG_R5"
fi

if [[ "$FRONT_ACTIVE" == false ]]; then
  : > "$LOG_FRONTEND"
  PDC_V5C41_PROXY=sandbox nohup npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort \
    >>"$LOG_FRONTEND" 2>&1 &
  echo $! > "${PID_DIR}/frontend.pid"
  echo "5174  Vite lancé    — log : $LOG_FRONTEND"
fi

echo
echo "=== Vérification automatique ==="

FAILED=0

if wait_health "V5-C.41 / 8789" v5c_healthy "$LOG_V5C" 45; then
  echo "8789  V5-C.41 Cameroun : OK"
else
  FAILED=1
fi

if wait_health "R5.1 / 8790" r5_healthy "$LOG_R5" 45; then
  echo "8790  R5.1 diaspora     : OK"
else
  FAILED=1
fi

if wait_health "Vite / 5174" frontend_healthy "$LOG_FRONTEND" 45; then
  echo "5174  Frontend Vite     : OK"
else
  FAILED=1
fi

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "============================================================"
  echo " PDC DEV READY"
  echo "============================================================"
  printf ' Frontend .......... 5174  OK  %s\n' "$FRONTEND_URL"
  printf ' Cameroun V5C41 .... 8789  OK  %s\n' "$V5C_URL"
  printf ' Diaspora R5.1 ..... 8790  OK  %s\n' "$R5_URL"
  echo
  echo " Retours navigateur attendus :"
  echo "   Cameroun : ${FRONTEND_URL}/retour-paiement"
  echo "   Diaspora : ${FRONTEND_URL}/retour-paiement?kind=adhesion"
  echo
  echo " Logs :"
  echo "   Frontend : $LOG_FRONTEND"
  echo "   V5C41    : $LOG_V5C"
  echo "   R5.1     : $LOG_R5"
  echo "============================================================"
  exit 0
fi

echo "PDC DEV PARTIELLEMENT DISPONIBLE — consulter les logs ci-dessus." >&2
exit 1
