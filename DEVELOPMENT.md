# Development Guide

This guide explains how to set up and develop the AI Assistant locally.

## Prerequisites

- Node.js 20+
- npm or yarn
- SQLite3

## Local Development Setup

### 1. Run Setup Script

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

This will:
- Create `.env` file from `.env.example`
- Generate encryption keys
- Create necessary directories

### 2. Install Dependencies

```bash
cd apps/web
npm install
```

### 3. Initialize Database

```bash
npm run db:migrate
```

This creates the SQLite database with all required tables.

### 4. Configure OAuth (Optional for Development)

For local development, you can skip OAuth setup initially. The app will work without Google/Notion integration for testing the chat interface.

If you want to test OAuth locally:

1. Create OAuth apps in Google and Notion consoles
2. Set redirect URIs to `http://localhost:3000/api/auth/google/callback` and `http://localhost:3000/api/auth/notion/callback`
3. Add credentials to `.env`

### 5. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### 6. Run n8n Locally (Optional)

For full tool integration testing:

```bash
docker compose up n8n redis
```

Access n8n at `http://localhost:5678`.

## Project Structure

```
/root/Hotz_AI_Lab/
├── apps/
│   ├── web/                      # Next.js application
│   │   ├── app/                  # App router pages
│   │   │   ├── api/              # API routes
│   │   │   │   ├── chat/         # Main chat endpoint
│   │   │   │   ├── auth/         # OAuth flows
│   │   │   │   ├── conversations/# Conversation management
│   │   │   │   └── settings/     # Settings endpoints
│   │   │   ├── page.tsx          # Main chat UI
│   │   │   └── settings/         # Settings page
│   │   ├── lib/                  # Utilities
│   │   │   ├── db/               # Database operations
│   │   │   ├── tools/            # Tool definitions
│   │   │   ├── encryption.ts     # Encryption utilities
│   │   │   └── n8n-client.ts     # n8n integration
│   │   ├── package.json
│   │   └── Dockerfile
│   └── n8n/
│       └── workflows/            # n8n workflow templates
├── data/                         # Runtime data (SQLite, etc.)
├── scripts/                      # Utility scripts
├── docker-compose.yml            # Docker orchestration
├── Caddyfile                     # Reverse proxy config
└── README.md                     # Original specs
```

## Key Components

### Database Layer (`lib/db/`)

- `index.ts` - Database operations and models
- `migrate.ts` - Schema migrations

### API Routes (`app/api/`)

- `/chat` - Main chat endpoint with streaming
- `/auth/google` - Google OAuth flow
- `/auth/notion` - Notion OAuth flow
- `/conversations` - Conversation CRUD
- `/settings/openrouter-key` - API key management

### Tools (`lib/tools/`)

- `definitions.ts` - Tool schemas for Claude
- All tools are executed via n8n workflows

### n8n Integration (`lib/n8n-client.ts`)

- Maps tool names to n8n workflows
- Handles webhook calls to n8n

## Development Workflow

### Making Changes

1. Edit files in `apps/web/`
2. Changes auto-reload in dev mode
3. Test in browser at `localhost:3000`

### Adding New Tools

1. Add tool definition to `lib/tools/definitions.ts`
2. Create corresponding n8n workflow
3. Add workflow mapping in `lib/n8n-client.ts`

### Database Changes

1. Modify schema in `lib/db/migrate.ts`
2. Run migration: `npm run db:migrate`
3. Update types in `lib/db/index.ts`

### Testing OAuth Locally

Use ngrok or similar for testing OAuth locally:

```bash
ngrok http 3000
```

Then use the ngrok URL in OAuth redirect URIs.

## Common Tasks

### Reset Database

```bash
rm data/sqlite/app.db
npm run db:migrate
```

### View Database

```bash
sqlite3 data/sqlite/app.db
.tables
.schema users
SELECT * FROM users;
```

### Check Logs

Development server logs appear in terminal.

### Debug API Routes

Add `console.log` statements in API routes. They'll appear in terminal.

### Test Encryption

```typescript
import { encryptField, decryptField } from '@/lib/encryption';

const encrypted = encryptField('secret');
const decrypted = decryptField(encrypted);
```

## Environment Variables

Key variables for development:

- `NODE_ENV=development` - Enables dev mode
- `DATABASE_URL` - SQLite file path
- `APP_ENCRYPTION_KEY` - For encrypting secrets
- `NEXTAUTH_URL=http://localhost:3000` - Base URL

## Tips

### Hot Reload Issues

If changes don't reload:
```bash
rm -rf .next
npm run dev
```

### Database Locked

If you get "database is locked" errors:
```bash
rm data/sqlite/*.db-shm data/sqlite/*.db-wal
```

### TypeScript Errors

```bash
# Check for type errors
npx tsc --noEmit
```

## Building for Production

```bash
npm run build
npm run start
```

Or use Docker:

```bash
docker compose up --build
```

## Next Steps

- Add tests
- Implement authentication (NextAuth)
- Add more tool integrations
- Improve error handling
- Add rate limiting



