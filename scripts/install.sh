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

wait_for_apt() {
  local lock_files=(
    /var/lib/dpkg/lock-frontend
    /var/lib/apt/lists/lock
    /var/cache/apt/archives/lock
  )
  local start_ts
  start_ts=$(date +%s)
  local timeout=120

  while true; do
    local busy=0
    for lock in "${lock_files[@]}"; do
      if sudo fuser "$lock" >/dev/null 2>&1; then
        busy=1
        break
      fi
    done

    if [[ $busy -eq 0 ]]; then
      break
    fi

    local now
    now=$(date +%s)
    if (( now - start_ts > timeout )); then
      echo "[install] Detected lingering apt/dpkg lock; force-stopping other package managers…" >&2
      # Kill any stuck apt/dpkg processes
      local pids
      pids=$(pgrep -f 'apt|dpkg' || true)
      if [[ -n "$pids" ]]; then
        sudo kill -9 $pids >/dev/null 2>&1 || true
      fi
      # Clean up locks and reconfigure
      sudo rm -f "${lock_files[@]}" >/dev/null 2>&1 || true
      sudo dpkg --configure -a >/dev/null 2>&1 || true
      break
    fi

    printf '\r[install] Waiting for apt lock to clear (up to %ds)…' $((timeout - (now - start_ts)))
    sleep 3
  done
  printf '\r[install] Apt locks cleared.%*s\n' 40 ''
}

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
wait_for_apt
echo "[install] Updating apt package index…"
sudo -E apt-get update -y >/dev/null
wait_for_apt
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

echo "[install] Deployment initiated. Visit $DOMAIN to use the app once services finish starting."
