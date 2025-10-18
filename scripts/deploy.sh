#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[deploy] Building web image…"
docker compose build web

echo "[deploy] Recreating web service…"
docker compose up -d web

echo "[deploy] Running DB migrations…"
DATABASE_URL=file://$(pwd)/data/sqlite/app.db npm run -s db:migrate || true

echo "[deploy] Services status:"
docker compose ps

echo "[deploy] Hitting health endpoint…"
curl -fsS https://assistant.aytekaksu.com/api/health || true

echo "[deploy] Done."

