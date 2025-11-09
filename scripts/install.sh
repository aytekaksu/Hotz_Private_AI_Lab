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

: "${GITHUB_USER:?Set GITHUB_USER to your GitHub username}"
: "${GITHUB_PAT:?Set GITHUB_PAT to a GitHub personal access token with repo scope}"

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
sudo apt-get update -y >/dev/null
sudo apt-get install -y git curl ca-certificates docker.io docker-compose-plugin >/dev/null
sudo systemctl enable --now docker >/dev/null

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash >/dev/null
fi
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

rm -rf "$APP_DIR"
git clone --branch clean-install "https://${GITHUB_USER}:${GITHUB_PAT}@github.com/aytekaksu/Hotz_Private_AI_Lab.git" "$APP_DIR"
cd "$APP_DIR"

ACME_EMAIL="$ACME_EMAIL_INPUT" bun run bootstrap "$DOMAIN"
