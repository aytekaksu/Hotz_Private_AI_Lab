#!/usr/bin/env bash
set -euo pipefail

# Provision proper public TLS certificates for Caddy using either:
#  - Automatic HTTPS (HTTP-01/ALPN-01) with Let's Encrypt/ZeroSSL
#  - DNS challenge via Cloudflare (requires CLOUDFLARE_API_TOKEN and caddy-dns plugin)
#
# Requirements:
#  - ENV: INTERNAL_DOMAIN, ACME_EMAIL
#  - Optional: CLOUDFLARE_API_TOKEN (DNS challenge)
#  - docker compose available

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

DOMAIN=${INTERNAL_DOMAIN:-}
EMAIL=${ACME_EMAIL:-}
CLOUDFLARE_TOKEN=${CLOUDFLARE_API_TOKEN:-}

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "ERROR: INTERNAL_DOMAIN and ACME_EMAIL must be set (e.g. in .env)." >&2
  exit 1
fi

CADDYFILE="${ROOT_DIR}/Caddyfile"
BACKUP_FILE="${CADDYFILE}.$(date +%Y%m%d_%H%M%S).bak"

echo "Backing up Caddyfile to ${BACKUP_FILE}"
cp "$CADDYFILE" "$BACKUP_FILE"

echo "Generating Caddyfile for domain: $DOMAIN"

if [[ -n "$CLOUDFLARE_TOKEN" ]]; then
  # Use DNS challenge via Cloudflare
  cat > "$CADDYFILE" <<EOF
{
    email ${EMAIL}
}

${DOMAIN} {
    reverse_proxy web:3000

    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
    }
}
EOF
  echo "Configured DNS challenge with Cloudflare."
else
  # Rely on automatic HTTPS using HTTP/ALPN challenge
  cat > "$CADDYFILE" <<EOF
{
    email ${EMAIL}
}

${DOMAIN} {
    reverse_proxy web:3000

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
    }
}
EOF
  echo "Configured automatic HTTPS (HTTP/ALPN challenge)."
fi

echo "Restarting Caddy with new configuration..."
docker compose up -d caddy

echo "Done. Caddy will request publicly trusted certificates for ${DOMAIN}."

