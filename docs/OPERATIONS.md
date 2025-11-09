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

Integrations
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# Optional — configure via env or through Settings → Notion
NOTION_INTEGRATION_SECRET=...
```

Use Settings → Connected Services → Notion to paste the private integration secret at runtime if you don't set it via environment variables.

Token Controls
```env
GCAL_MAX_EVENTS=50
GCAL_MAX_EVENT_DESCRIPTION=140
GTASKS_MAX_TASKS=50
GTASKS_TIMEOUT_MS=15000
```

## Build & Deploy

```bash
docker compose build web          # add --no-cache for a clean rebuild
docker compose up -d
```

Quick Deploy Script
```
bun run deploy            # bun run deploy --clean to disable Docker cache
```
- Optionally run `bun run verify` first to lint + type-check outside Docker
- Uses Docker Buildx (auto-installed via `bun run deploy` or `bun run setup:buildx`) with a persisted cache in `.docker/cache` to accelerate production builds
- Builds the `web` image (Next.js app)
- Restarts only the `web` service
- Executes DB migrations against `./data/sqlite/app.db` (idempotent)
- Prints `docker compose ps` and performs a lightweight `/api/health` check
- Uses Bun to install workspace dependencies before building; clean builds remain available with `--clean`

Script location: `scripts/deploy.ts` (TypeScript Bun CLI invoked via `bun run deploy`)

Prereqs
- Bun 1.3.2+ installed on the host (deploy script and tooling run with Bun)
- `.env` configured for production (see Configuration)
- Docker, docker compose, and the Docker Buildx CLI plugin (install via `bun run setup:buildx` or allow `bun run deploy` to bootstrap it)
- Caddy is already running via `docker compose up -d` with a valid `Caddyfile`

Database migrations can be run outside the container (or provided as a task inside a CI job):

```bash
DATABASE_URL=file:///root/Hotz_AI_Lab/data/sqlite/app.db bun run db:migrate
```

> **Note:** Always run the migration command above immediately after pulling new code (and before testing OAuth integrations). Missing schema updates—such as the `account_email` column on `oauth_credentials`—can silently break Google Calendar/Tasks tool calls even when tokens refresh successfully.

### Bun Automation Scripts
All operational helpers now live under `scripts/*.ts` and are executed with `bun run <script>`:

- `bun run deploy` — orchestrates Buildx image builds, service restarts, migrations, and health checks.
- `bun run backup` — stops services, snapshots `data/sqlite` + `.env`, restarts containers, and prunes backups older than 7 days (configurable via `BACKUP_DIR`/`BACKUP_RETENTION_DAYS`).
- `bun run restore /path/to/backup.tar.gz` — shuts down compose services, extracts the tarball at `/`, and brings the stack back up.
- `bun run provision:tls` — rewrites `Caddyfile` for the current `INTERNAL_DOMAIN`/`ACME_EMAIL`, optionally wiring the Cloudflare DNS plugin, then restarts `caddy`.
- `bun run setup:buildx` — installs or refreshes the Docker Buildx CLI plugin; `bun run deploy` calls this automatically when needed.

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

SQLite lives in `./data/sqlite` (mounted into the container). Include this directory in your backup routine. Use `bun run backup` (driven by `scripts/backup.ts`) to automate the process: it stops services, archives `data/sqlite` and `.env` into `/opt/backups/ai-assistant/backup_<timestamp>.tar.gz` by default, restarts the stack, and trims backups older than 7 days. Restore from any generated archive with `bun run restore /path/to/backup_<timestamp>.tar.gz`.

The `deployment-backup/*` folder contains previously captured deployment info; do not rely on it as a live backup.

## Security
- Secrets encrypted at rest (AES‑256‑GCM) using `APP_ENCRYPTION_KEY`.
- OAuth tokens stored encrypted; rotate keys periodically.
- Ensure TLS is correctly provisioned by Caddy; keep tokens out of logs.

## Server-only dependencies
- Heavy SDKs that never run in the browser (Google APIs, Notion, PDF/DOCX parsing, etc.) must be listed under `experimental.serverComponentsExternalPackages` in `apps/web/next.config.js`.
- When adding a new backend-only dependency, append it to that array so Next.js skips bundling it during `next build`, keeping clean builds fast.
- The root layout sets `export const dynamic = 'force-dynamic'`; mirror that behavior for any new top-level layouts that depend on request-specific state so static generation stays opt-in.
