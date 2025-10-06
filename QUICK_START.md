# Quick Start Guide

## Fastest Way to Get Started

### Option 1: Automated Quick Start (Recommended)

```bash
cd /root/Hotz_AI_Lab
./scripts/quick-start.sh
```

This will:
1. Check prerequisites
2. Run setup if needed
3. Install dependencies
4. Initialize database
5. Start the dev server

Then open http://localhost:3000 in your browser!

### Option 2: Manual Setup

```bash
# 1. Install prerequisites (if not already installed)
sudo ./scripts/install-prerequisites.sh

# 2. Run project setup
./scripts/setup.sh

# 3. Install dependencies
cd apps/web
npm install

# 4. Initialize database
npm run db:migrate

# 5. Start development server
npm run dev
```

### Option 3: Check Current Status

Before running anything, check if the system is ready:

```bash
cd /root/Hotz_AI_Lab
./scripts/verify-setup.sh
```

This will tell you exactly what's missing and what needs to be done.

## After Starting

1. Open your browser to http://localhost:3000
2. Click the ⚙️ **Settings** button in the sidebar
3. Get an OpenRouter API key from https://openrouter.ai/
4. Paste your API key in Settings and click "Save API Key"
5. Go back to the chat and start talking!

## Test Commands

Try these in the chat:

```
"Hello! What can you help me with?"
"Tell me about yourself"
"What integrations do you support?"
```

## Optional: Connect Google & Notion

To enable Google Calendar, Tasks, and Notion integrations:

1. Set up OAuth apps (see GETTING_STARTED.md for details)
2. Add credentials to `.env`:
   ```
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   NOTION_CLIENT_ID=your_client_id
   NOTION_CLIENT_SECRET=your_client_secret
   ```
3. Restart the server
4. Go to Settings and click "Connect Google Account" and "Connect Notion"

## Troubleshooting

### "npm: command not found"

Install Node.js:
```bash
sudo ./scripts/install-prerequisites.sh
```

### Port 3000 already in use

Either stop the other service or change the port:
```bash
PORT=3001 npm run dev
```

### Database errors

Reset the database:
```bash
rm data/sqlite/app.db
npm run db:migrate
```

### Changes not appearing

Clear the Next.js cache:
```bash
rm -rf .next
npm run dev
```

## Useful Commands

```bash
# Check system status
./scripts/verify-setup.sh

# View database
sqlite3 data/sqlite/app.db

# Check health endpoint
curl http://localhost:3000/api/health

# Check status endpoint
curl http://localhost:3000/api/status

# View logs (development)
# Logs appear in the terminal where you ran npm run dev

# View logs (Docker)
docker compose logs -f
```

## What's Running

When you start the dev server:
- **Next.js**: http://localhost:3000 (main app)
- **API Routes**: http://localhost:3000/api/*
- **Health Check**: http://localhost:3000/api/health
- **Status**: http://localhost:3000/api/status

## Production Mode

For production deployment with Docker:

```bash
# Build and start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

## Get Help

- Check **GETTING_STARTED.md** for detailed setup
- Check **DEVELOPMENT.md** for development workflow
- Check **DEPLOYMENT.md** for production deployment
- Check **PROJECT_SUMMARY.md** for architecture overview

## Common Issues

| Issue | Solution |
|-------|----------|
| Can't access localhost | Check firewall, try `curl http://localhost:3000` |
| 404 errors | Restart dev server |
| Build errors | Delete .next and node_modules, reinstall |
| Database locked | Stop server, delete .db-shm and .db-wal files |
| Module not found | Run `npm install` again |

## Next Steps

Once the app is running:

1. **Add OpenRouter API Key** (Required)
   - Get key from https://openrouter.ai/
   - Add in Settings page

2. **Connect Services** (Optional)
   - Set up Google OAuth
   - Set up Notion OAuth
   - Configure n8n workflows

3. **Start Chatting!**
   - Ask about your calendar
   - Create tasks
   - Manage Notion pages

Enjoy your AI Assistant! 🚀


