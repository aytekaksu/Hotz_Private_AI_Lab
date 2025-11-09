AI Assistant (Next.js + AI SDK v5)
=================================

An extensible personal AI assistant built with Next.js 14, Vercel AI SDK v5, and OpenRouter. It supports multi‑step tool calling (Google Calendar, Google Tasks, Notion), image understanding, seamless current‑time awareness, and streaming chat with a Stop button.

Live: https://assistant.aytekaksu.com

Features
- Streaming chat UI (Next.js App Router) with a Stop button
- Multi‑step tool calling via AI SDK v5 (OpenRouter provider)
- Tool integrations: Google Calendar, Google Tasks, Notion
- Image attachments: sent as file parts for model vision
- Seamless “what time is it” answers (no tool mentions)
- Token‑safe calendar queries with output shaping and pagination
- SQLite persistence (conversations, messages, attachments, OAuth creds)
- Docker + Caddy deployment

Quick Start (local)
1) Requirements
- Bun 1.3.2+

2) Install (web app)
```bash
cd /root/Hotz_AI_Lab
bun install
```

3) Environment
Create `apps/web/.env.local` (see “Configuration” below). Minimum for local:
```env
NODE_ENV=production
DATABASE_URL=file:./data/app.db
APP_ENCRYPTION_KEY=<32+ byte hex>
NEXTAUTH_SECRET=<random hex>
NEXTAUTH_URL=http://localhost:3000
OPENROUTER_API_KEY=<your-openrouter-key>
```

4) Run the dev server
```bash
cd apps/web
bun run dev
```
Visit http://localhost:3000 and add your OpenRouter key under Settings. Connect Google and add your Notion integration secret when needed.

Production with Docker
```bash
docker compose build web          # add --no-cache for a clean rebuild
docker compose up -d
```

Notes
- Bun is the only runtime for development and production. Install Bun 1.3.2+ locally for tooling parity; Node/npm are no longer required.
- Docker builds use Buildx with on-disk cache metadata in `.docker/cache`; `bun run deploy --clean` is available for reproducible cache-free builds.
- Redis, NextAuth, `better-sqlite3`, and other unused Node tooling have been removed to keep the stack lean.

Deploy
- One‑command deploy to production (Docker + Caddy):
  - Requirements: Docker, docker compose, Docker Buildx plugin (auto-installed via `bun run deploy` or `bun run setup:buildx`), valid `.env` at repo root (see docs/OPERATIONS.md)
  - Recommended preflight: `bun run verify` (lint + type-check outside the Docker build)
  - Command: `bun run deploy` (use `--clean`/`--no-cache` for a clean-room image)
  - What it does:
    - Builds the `web` image
    - Restarts the `web` service
    - Runs database migrations idempotently
    - Prints service status and hits `/api/health`
  - Cache tips: Buildx stores reusable layers under `.docker/cache`; delete the directory or pass `--clean` to force a full rebuild.

Configuration
Core
```env
APP_ENCRYPTION_KEY=...                      # AES-256-GCM key for secrets at rest
DATABASE_URL=file:///data/app.db            # Docker/production (mounted volume)
# DATABASE_URL=file:./data/app.db          # Local dev (inside apps/web)
NEXTAUTH_URL=https://your.domain
NEXTAUTH_SECRET=...
OPENROUTER_API_KEY=...
APP_PUBLIC_URL=https://your.domain          # sent as HTTP-Referer to OpenRouter
APP_NAME=Hotz AI Assistant                  # X-Title header for OpenRouter attribution
OPENROUTER_MODEL=anthropic/claude-haiku-4.5
OPENROUTER_ROUTING_VARIANT=floor            # ':floor' (price-first) or ':nitro' (speed-first)
ANTHROPIC_API_KEY=...                       # optional: enable direct Anthropic provider
# ANTHROPIC_SONNET_4_5_ID=claude-sonnet-4-5-20250929   # optional overrides
# ANTHROPIC_HAIKU_4_5_ID=claude-haiku-4-5-20251001
```

Google OAuth
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Notion integration secret (private integrations)
```env
# Optional — you can also paste the secret in Settings → Notion
NOTION_INTEGRATION_SECRET=...
```

After creating a Notion private integration, copy the secret into Settings → Connected Services → Notion (or set `NOTION_INTEGRATION_SECRET` before boot).

Calendar output shaping (token control)
```env
GCAL_MAX_EVENTS=50                  # hard upper bound
GCAL_MAX_EVENT_DESCRIPTION=140      # default truncation
```

Tasks output shaping
```env
GTASKS_MAX_TASKS=50                 # hard upper bound
GTASKS_TIMEOUT_MS=15000             # request timeouts in ms
```

Server-only dependencies
- Keep server-only SDKs (Google APIs, Notion, PDF/DOCX parsers, etc.) out of the RSC bundle by listing them in `experimental.serverComponentsExternalPackages` inside `apps/web/next.config.js`.
- When adding another backend-only library, append it to that array so Next.js skips unnecessary SWC work during `next build`.
- The root layout exports `dynamic = 'force-dynamic'` to skip static generation for user-scoped pages; do the same if you introduce additional top-level layouts that depend on runtime data.

Tech Stack
- Next.js 14 (App Router), React 18, Tailwind
- AI SDK v5 (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `@ai-sdk/anthropic`)
- SQLite via Bun's built-in `bun:sqlite`
- Google APIs (`googleapis`), Notion SDK (`@notionhq/client`)
- Docker + Caddy (TLS, reverse proxy)

Repository Map (for agents)
- `apps/web/app/api/chat/route.ts` — streaming chat route, builds tool set, saves messages
- `apps/web/lib/tools/definitions.ts` — tool schemas + UI metadata
- `apps/web/lib/tools/executor.ts` — dispatches tool calls to implementations
- `apps/web/lib/tools/google-calendar.ts` — Calendar tools (token‑safe output shaping)
- `apps/web/lib/tools/google-tasks.ts` — Tasks tools (timeouts, shaping, pagination)
- `apps/web/lib/tools/notion.ts` — Notion tools
- `apps/web/lib/db/*` — SQLite wrapper + models, OAuth credential storage
- `apps/web/app/settings/page.tsx` — settings + OAuth connect flows
- `apps/web/components/tool-dialog.tsx` — per‑conversation tool toggles

How tool calling works (short)
- The chat server selects enabled tools per conversation and exposes their JSON schemas.
- The model calls tools with arguments; server executes and returns trimmed outputs.
- On finish, the assistant response and tool call events are persisted.

License
Proprietary. See repository owner for terms.
