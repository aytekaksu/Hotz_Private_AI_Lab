#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh <domain> <admin-email>

Arguments:
  domain        The domain where the app will be deployed (e.g. https://ai.example.com)
  admin-email   The Google email address authorized to use the app (also used for ACME TLS cert)

Environment variables:
  GITHUB_USER   GitHub username that can access the private repo (required)
  GITHUB_PAT    Personal access token with repo scope (required)
  APP_DIR       Target install directory (default: ~/Hotz_Private_AI_Lab)
  REPO_BRANCH   Git branch to clone (default: master)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 2 ]]; then
  echo "[install] ERROR: Both <domain> and <admin-email> are required." >&2
  usage
  exit 1
fi

DOMAIN="${1%/}"
ADMIN_EMAIL="${2}"

# Validate email format (simple check)
if [[ ! "$ADMIN_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
  echo "[install] ERROR: Invalid email format: $ADMIN_EMAIL" >&2
  exit 1
fi

# Use admin email for ACME as well
ACME_EMAIL_INPUT="$ADMIN_EMAIL"

if [[ ! "$DOMAIN" =~ ^https?:// ]]; then
  DOMAIN="https://${DOMAIN}"
fi

DOMAIN_HOST="${DOMAIN#http://}"
DOMAIN_HOST="${DOMAIN_HOST#https://}"
DOMAIN_HOST="${DOMAIN_HOST%%/*}"

APP_DIR="${APP_DIR:-$HOME/Hotz_Private_AI_Lab}"
REPO_BRANCH="${REPO_BRANCH:-master}"

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
echo "[install] Updating apt package index…"
sudo -E apt-get update -y >/dev/null
echo "[install] Installing base packages (git, curl, ca-certificates, unzip, openssl)…"
sudo -E apt-get install -y git curl ca-certificates unzip openssl >/dev/null

if ! command -v docker >/dev/null 2>&1; then
  echo "[install] Docker not found; installing via get.docker.com…"
  curl -fsSL https://get.docker.com | sudo sh >/dev/null
fi

echo "[install] Enabling & starting Docker service…"
sudo systemctl enable --now docker >/dev/null

if ! docker compose version >/dev/null 2>&1; then
  echo "[install] Docker Compose plugin missing; reinstalling Docker components…"
  curl -fsSL https://get.docker.com | sudo sh >/dev/null
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "[install] Installing Bun runtime…"
  curl -fsSL https://bun.sh/install | bash >/dev/null
fi
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

BUN_BIN="$BUN_INSTALL/bin/bun"
if [[ ! -x "$BUN_BIN" ]]; then
  echo "[install] ERROR: Bun binary not found at $BUN_BIN" >&2
  exit 1
fi

echo "[install] Linking Bun CLI to /usr/local/bin (requires sudo)…"
sudo install -m 0755 "$BUN_BIN" /usr/local/bin/bun

echo "[install] Cloning Hotz_Private_AI_Lab ($REPO_BRANCH) into $APP_DIR…"
rm -rf "$APP_DIR"
if [[ -n "${GITHUB_USER:-}" && -n "${GITHUB_PAT:-}" ]]; then
  git clone --branch "$REPO_BRANCH" "https://${GITHUB_USER}:${GITHUB_PAT}@github.com/aytekaksu/Hotz_Private_AI_Lab.git" "$APP_DIR"
else
  echo "[install] GITHUB_USER/PAT not provided; cloning anonymously (requires public repository)."
  git clone --branch "$REPO_BRANCH" https://github.com/aytekaksu/Hotz_Private_AI_Lab.git "$APP_DIR"
fi
cd "$APP_DIR"

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
fi

ensure_env_var() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

ensure_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    local current
    current=$(grep -m1 "^${key}=" .env | cut -d= -f2-)
    if [[ -n "${current}" ]]; then
      return
    fi
  fi
  ensure_env_var "$key" "$value"
}

ensure_env_var NEXTAUTH_URL "$DOMAIN"
ensure_env_var APP_PUBLIC_URL "$DOMAIN"
ensure_env_var INTERNAL_DOMAIN "$DOMAIN_HOST"
ensure_env_var ACME_EMAIL "$ACME_EMAIL_INPUT"
ensure_env_var AUTHORIZED_GOOGLE_EMAIL "$ADMIN_EMAIL"
ensure_env_var HEALTHCHECK_URL "${DOMAIN%/}/api/health"

if ! grep -q '^APP_ENCRYPTION_KEY=' .env || [[ -z "$(grep -m1 '^APP_ENCRYPTION_KEY=' .env | cut -d= -f2-)" ]]; then
  GENERATED_KEY=$(openssl rand -hex 32)
  ensure_env_var APP_ENCRYPTION_KEY "$GENERATED_KEY"
  echo "[install] Generated APP_ENCRYPTION_KEY"
fi

echo "[install] Running bootstrap for $DOMAIN…"
ACME_EMAIL="$ACME_EMAIL_INPUT" bun run bootstrap "$DOMAIN"

echo "[install] Waiting for TLS certificate and health check…"
HEALTH_URL="${DOMAIN%/}/api/health"
MAX_ATTEMPTS=60
SLEEP_SECONDS=5
attempt=1
until curl -fs --max-time 5 "$HEALTH_URL" >/dev/null; do
  if [[ $attempt -ge $MAX_ATTEMPTS ]]; then
    echo "[install] ERROR: Health check at $HEALTH_URL did not succeed after $MAX_ATTEMPTS attempts."
    exit 1
  fi
  printf '\r[install] Attempt %d/%d: waiting for %s to become ready…' "$attempt" "$MAX_ATTEMPTS" "$DOMAIN"
  attempt=$((attempt + 1))
  sleep "$SLEEP_SECONDS"
done
printf '\r[install] Health check succeeded at %s after %d attempt(s).\n' "$HEALTH_URL" "$attempt"
echo "[install] Deployment complete. Visit $DOMAIN to use the app."
