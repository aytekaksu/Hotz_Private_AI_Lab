AI Assistant (Next.js + AI SDK v5)
=================================

An extensible personal AI assistant built with Next.js 14, Vercel AI SDK v5, and OpenRouter. It supports multi‑step tool calling (Google Calendar, Google Tasks, Notion), image understanding, seamless current‑time awareness, and streaming chat with a Stop button.

Live: https://assistant.aytekaksu.com

Features
-
- Streaming chat UI (Next.js App Router) with a Stop button
- Multi‑step tool calling via AI SDK v5 (OpenRouter provider)
- Tool integrations: Google Calendar, Google Tasks, Notion
- Image attachments: sent as file parts for model vision
- Seamless “what time is it” answers (no tool mentions)
- Token‑safe calendar queries with output shaping and pagination
- SQLite persistence (conversations, messages, attachments, OAuth creds)
- Docker + Caddy deployment

Quick Start (local)
-
1) Requirements
- Bun 1.0+, Docker, docker compose

2) Install and build
```bash
bun install
bun run build
```

3) Environment
Create `.env` at repo root (see “Configuration” below). Minimum for local:
```env
NODE_ENV=production
DATABASE_URL=file:///data/app.db
APP_ENCRYPTION_KEY=<32+ byte hex>
NEXTAUTH_SECRET=<random hex>
NEXTAUTH_URL=http://localhost:3000
OPENROUTER_API_KEY=<your-openrouter-key>
```

4) Run via Docker
```bash
docker compose build web
docker compose up -d
```
Visit http://localhost:3000 and add your OpenRouter key under Settings. Connect Google/Notion when needed.

Documentation
-
- Architecture & Tool Calling: docs/ARCHITECTURE.md
- Operations & Deployment: docs/OPERATIONS.md
- Changelog: CHANGELOG.md

Configuration
-
Core
```env
APP_ENCRYPTION_KEY=...        # AES-256-GCM key for secrets at rest
DATABASE_URL=file:///data/app.db
NEXTAUTH_URL=https://your.domain
NEXTAUTH_SECRET=...
OPENROUTER_API_KEY=...
```

Google / Notion OAuth
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NOTION_CLIENT_ID=...
NOTION_CLIENT_SECRET=...
```

Calendar output shaping (token control)
```env
GCAL_MAX_EVENTS=50                  # hard upper bound
GCAL_MAX_EVENT_DESCRIPTION=140      # default truncation
```

Tech Stack
-
- Next.js 14 (App Router), React 18, Tailwind
- AI SDK v5 (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`) via OpenRouter
- SQLite (better-sqlite3) with Bun runtime support in development
- Google APIs (`googleapis`), Notion SDK (`@notionhq/client`)
- Docker + Caddy (TLS, reverse proxy)

Notes on Bun
- Dev and builds use Bun for speed: `bun install`, `bun run dev`, `bun run build`.
- Docker image builds with Bun but runs on Node 20 for maximum Next.js compatibility.
- Database access prefers `bun:sqlite` when running under Bun; Node uses `better-sqlite3`.

License
-
Proprietary. See repository owner for terms.
