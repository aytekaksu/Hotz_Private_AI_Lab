# Operations & Deployment

## Environments
The app runs via Docker compose with two services:

- `web` (Next.js app)
- `caddy` (reverse proxy + TLS)

Health endpoints:
- `/api/health` — database/env checks
- `/api/status` — runtime info + OAuth feature flags

## Configuration

Core
```env
NODE_ENV=production
DATABASE_URL=file:///data/app.db
APP_ENCRYPTION_KEY=<32+ byte hex>
NEXTAUTH_URL=https://your.domain
NEXTAUTH_SECRET=<random hex>
OPENROUTER_API_KEY=<key or user setting>
APP_PUBLIC_URL=https://your.domain
APP_NAME=Hotz AI Assistant
OPENROUTER_MODEL=anthropic/claude-haiku-4.5
OPENROUTER_ROUTING_VARIANT=floor
ANTHROPIC_API_KEY=<key or user setting>
# Optional overrides when using direct Anthropic
# ANTHROPIC_SONNET_4_5_ID=claude-sonnet-4-5-20250929
# ANTHROPIC_HAIKU_4_5_ID=claude-haiku-4-5-20251001
```

OAuth
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NOTION_CLIENT_ID=...
NOTION_CLIENT_SECRET=...
```

Token Controls
```env
GCAL_MAX_EVENTS=50
GCAL_MAX_EVENT_DESCRIPTION=140
GTASKS_MAX_TASKS=50
GTASKS_TIMEOUT_MS=15000
```

## Build & Deploy

```bash
docker compose build web
docker compose up -d
```

Quick Deploy Script
```
npm run deploy
```
- Builds the `web` image (Next.js app)
- Restarts only the `web` service
- Executes DB migrations against `./data/sqlite/app.db` (idempotent)
- Prints `docker compose ps` and performs a lightweight `/api/health` check

Script location: `scripts/deploy.sh`

Prereqs
- `.env` configured for production (see Configuration)
- Docker and docker compose installed
- Caddy is already running via `docker compose up -d` with a valid `Caddyfile`

Database migrations can be run outside the container (or provided as a task inside a CI job):

```bash
DATABASE_URL=file:///root/Hotz_AI_Lab/data/sqlite/app.db npm run db:migrate
```

> **Note:** Always run the migration command above immediately after pulling new code (and before testing OAuth integrations). Missing schema updates—such as the `account_email` column on `oauth_credentials`—can silently break Google Calendar/Tasks tool calls even when tokens refresh successfully.

## Logs & Troubleshooting

View logs:
```bash
docker compose logs -f web
```

Bounded tail (avoid hanging):
```bash
timeout 20s docker compose logs -f web \
  | grep -E "Tool called:|Tool result:|Error|/api/chat|/api/health"
```

Common issues:
- OpenRouter 401/429 — verify `OPENROUTER_API_KEY` or per‑user key; respect rate limits.
- Google Calendar 400 (Bad Request) — ensure `timeMin/timeMax` are RFC3339; we normalize dates, but incorrect ranges can still fail.
- Tool tokens too high — calendar outputs trimmed by default; don’t enable `include_description/location/attendees/link` unless required; paginate via `next_page_token`.
- Google Tasks long/hanging calls — requests are time‑boxed via `GTASKS_TIMEOUT_MS` and outputs are shaped by `GTASKS_MAX_TASKS`, `include_completed`, `include_notes`, and `page_token`.
- Timeouts from `/api/chat` — check proxy (`caddy`) timeouts and model latency; large tool outputs are the usual culprit (now mitigated).

## Backups

SQLite lives in `./data/sqlite` (mounted into the container). Include this directory in your backup routine. The `deployment-backup/*` folder contains previously captured deployment info; do not rely on it as a live backup.

## Security
- Secrets encrypted at rest (AES‑256‑GCM) using `APP_ENCRYPTION_KEY`.
- OAuth tokens stored encrypted; rotate keys periodically.
- Ensure TLS is correctly provisioned by Caddy; keep tokens out of logs.
