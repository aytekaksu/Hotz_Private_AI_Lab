#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v bun >/dev/null 2>&1; then
  echo "[deploy] Bun 1.3.1+ is required. Install it from https://bun.sh" >&2
  exit 1
fi

echo "[deploy] Ensuring workspace dependencies…"
bun install >/dev/null 2>&1 || bun install

BUN_BASE_IMAGE="oven/bun:1.3.1-alpine"
BUN_IMAGE_ARCHIVE="bun-1.3.1-alpine.tar"

ensure_base_image() {
  if docker image inspect "$BUN_BASE_IMAGE" >/dev/null 2>&1; then
    return
  fi

  if [ -f "$BUN_IMAGE_ARCHIVE" ]; then
    echo "[deploy] Loading $BUN_BASE_IMAGE from $BUN_IMAGE_ARCHIVE…"
    docker load -i "$BUN_IMAGE_ARCHIVE" >/dev/null 2>&1 || docker load -i "$BUN_IMAGE_ARCHIVE"
    if ! docker image inspect "$BUN_BASE_IMAGE" >/dev/null 2>&1; then
      echo "[deploy] Failed to load $BUN_BASE_IMAGE from $BUN_IMAGE_ARCHIVE." >&2
      exit 1
    fi
  else
    echo "[deploy] $BUN_BASE_IMAGE not present and $BUN_IMAGE_ARCHIVE not found. Connect to Docker Hub or add the archive." >&2
    exit 1
  fi
}

ensure_base_image

echo "[deploy] Building web image…"
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0
docker compose build --no-cache web

echo "[deploy] Recreating web service…"
docker compose up -d web

echo "[deploy] Running DB migrations…"
DATABASE_URL="file://$(pwd)/data/sqlite/app.db" bun run db:migrate || true

echo "[deploy] Services status:"
docker compose ps

echo "[deploy] Hitting health endpoint…"
curl -fsS https://assistant.aytekaksu.com/api/health || true

echo "[deploy] Done."

