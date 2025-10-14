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
```

## Build & Deploy

```bash
docker compose build web
docker compose up -d
```

Database migrations can be run outside the container (or provided as a task inside a CI job):

```bash
DATABASE_URL=file:///root/Hotz_AI_Lab/data/sqlite/app.db npm run db:migrate
```

## Logs & Troubleshooting

View logs:
```bash
docker compose logs -f web
```

Common issues:
- OpenRouter 401/429 — verify `OPENROUTER_API_KEY` or per‑user key; respect rate limits.
- Google Calendar 400 (Bad Request) — ensure `timeMin/timeMax` are RFC3339; we normalize dates, but incorrect ranges can still fail.
- Tool tokens too high — calendar outputs trimmed by default; don’t enable `include_description/location/attendees/link` unless required; paginate via `next_page_token`.
- Timeouts from `/api/chat` — check proxy (`caddy`) timeouts and model latency; large tool outputs are the usual culprit (now mitigated).

## Backups

SQLite lives in `./data/sqlite` (mounted into the container). Include this directory in your backup routine. The `deployment-backup/*` folder contains previously captured deployment info; do not rely on it as a live backup.

## Security
- Secrets encrypted at rest (AES‑256‑GCM) using `APP_ENCRYPTION_KEY`.
- OAuth tokens stored encrypted; rotate keys periodically.
- Ensure TLS is correctly provisioned by Caddy; keep tokens out of logs.

