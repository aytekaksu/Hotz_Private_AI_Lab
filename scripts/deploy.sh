#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v bun >/dev/null 2>&1; then
  echo "[deploy] Bun 1.3.1+ is required. Install it from https://bun.sh" >&2
  exit 1
fi

echo "[deploy] Ensuring workspace dependencies…"
bun install >/dev/null 2>&1 || bun install

echo "[deploy] Building web image…"
docker-compose build --no-cache web

echo "[deploy] Recreating web service…"
docker-compose up -d web

echo "[deploy] Running DB migrations…"
DATABASE_URL="file://$(pwd)/data/sqlite/app.db" bun run db:migrate || true

echo "[deploy] Services status:"
docker-compose ps

echo "[deploy] Hitting health endpoint…"
curl -fsS https://assistant.aytekaksu.com/api/health || true

echo "[deploy] Done."

