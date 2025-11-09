#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh <domain> [acme-email]

Environment variables:
  GITHUB_USER   GitHub username that can access the private repo (required)
  GITHUB_PAT    Personal access token with repo scope (required)
  ACME_EMAIL    Optional override for TLS provisioning email (defaults to ops@example.com)
  APP_DIR       Target install directory (default: ~/Hotz_Private_AI_Lab)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

DOMAIN="${1%/}"
DEFAULT_ACME_EMAIL="${ACME_EMAIL:-ops@example.com}"
ACME_EMAIL_INPUT="${2:-$DEFAULT_ACME_EMAIL}"
if [[ -z "${2:-}" && -z "${ACME_EMAIL:-}" ]]; then
  echo "[install] No ACME email provided; using placeholder ${DEFAULT_ACME_EMAIL}" >&2
fi

if [[ ! "$DOMAIN" =~ ^https?:// ]]; then
  DOMAIN="https://${DOMAIN}"
fi

APP_DIR="${APP_DIR:-$HOME/Hotz_Private_AI_Lab}"

export DEBIAN_FRONTEND=noninteractive
echo "[install] Updating apt package index…"
sudo apt-get update -y >/dev/null
echo "[install] Installing base packages (git, curl, ca-certificates, unzip)…"
sudo apt-get install -y git curl ca-certificates unzip >/dev/null

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

echo "[install] Cloning Hotz_Private_AI_Lab into $APP_DIR…"
rm -rf "$APP_DIR"
if [[ -n "${GITHUB_USER:-}" && -n "${GITHUB_PAT:-}" ]]; then
  git clone --branch clean-install "https://${GITHUB_USER}:${GITHUB_PAT}@github.com/aytekaksu/Hotz_Private_AI_Lab.git" "$APP_DIR"
else
  echo "[install] GITHUB_USER/PAT not provided; cloning anonymously (requires public repository)."
  git clone --branch clean-install https://github.com/aytekaksu/Hotz_Private_AI_Lab.git "$APP_DIR"
fi
cd "$APP_DIR"

echo "[install] Running bootstrap for $DOMAIN…"
ACME_EMAIL="$ACME_EMAIL_INPUT" bun run bootstrap "$DOMAIN"
