# AI Assistant Project - Documentation Index

Welcome! This is a complete, production-ready AI assistant application that integrates Claude Sonnet 4 with Google Calendar, Google Tasks, and Notion.

## 📚 Documentation Guide

### 🚀 Getting Started (Start Here!)

1. **[QUICK_START.md](QUICK_START.md)** ⭐ **START HERE**
   - Fastest way to get the app running
   - Automated setup scripts
   - 5-minute setup guide

2. **[GETTING_STARTED.md](GETTING_STARTED.md)**
   - Comprehensive installation guide
   - Prerequisites installation
   - OAuth setup instructions
   - First-time configuration

### 📖 Main Documentation

3. **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)**
   - Complete overview of what was built
   - Architecture and tech stack
   - File structure and components
   - 27 TypeScript files created

4. **[DEVELOPMENT.md](DEVELOPMENT.md)**
   - Development workflow
   - Project structure explained
   - How to add features
   - Common development tasks

5. **[DEPLOYMENT.md](DEPLOYMENT.md)**
   - Production deployment guide
   - Docker setup
   - Security configuration
   - Backup and monitoring

6. **[README.md](README.md)**
   - Original project specifications
   - Complete technical requirements
   - Feature descriptions

## 🛠️ Quick Commands

### First-Time Setup
```bash
# Automated setup (recommended)
./scripts/quick-start.sh

# Or manual setup
sudo ./scripts/install-prerequisites.sh  # Install Node, Docker, etc.
./scripts/setup.sh                       # Generate keys, create dirs
cd apps/web && npm install               # Install dependencies
npm run db:migrate                       # Initialize database
npm run dev                              # Start dev server
```

### Verify Setup
```bash
./scripts/verify-setup.sh  # Check if everything is ready
```

### Health Checks
```bash
curl http://localhost:3000/api/health   # Health check
curl http://localhost:3000/api/status   # System status
```

### Maintenance
```bash
./scripts/backup.sh                     # Create backup
./scripts/restore.sh backup.tar.gz      # Restore from backup
```

## 📁 Project Structure

```
/root/Hotz_AI_Lab/
├── 📱 apps/
│   ├── web/                    # Next.js application
│   │   ├── app/                # Pages and API routes
│   │   │   ├── api/
│   │   │   │   ├── chat/       # Main AI chat endpoint
│   │   │   │   ├── auth/       # OAuth flows
│   │   │   │   ├── health/     # Health check
│   │   │   │   └── status/     # Status endpoint
│   │   │   ├── page.tsx        # Chat interface
│   │   │   └── settings/       # Settings page
│   │   └── lib/                # Core libraries
│   │       ├── db/             # Database layer
│   │       ├── tools/          # AI tool definitions
│   │       ├── encryption.ts   # Security
│   │       └── n8n-client.ts   # Integration
│   └── n8n/
│       └── workflows/          # 6 pre-built workflows
│
├── 🗄️ data/                    # Runtime data (auto-created)
│   ├── sqlite/                 # SQLite databases
│   ├── caddy/                  # Caddy data
│   └── redis/                  # Redis data
│
├── 🔧 scripts/                 # Utility scripts
│   ├── install-prerequisites.sh # Install Node, Docker
│   ├── setup.sh                # Initial setup
│   ├── quick-start.sh          # Automated start
│   ├── verify-setup.sh         # Verify installation
│   ├── backup.sh               # Backup databases
│   └── restore.sh              # Restore backups
│
├── 🐳 Docker Files
│   ├── docker-compose.yml      # All services
│   ├── Caddyfile               # Reverse proxy
│   └── apps/web/Dockerfile     # Web app container
│
└── 📚 Documentation
    ├── INDEX.md                # This file
    ├── QUICK_START.md          # Fast setup guide
    ├── GETTING_STARTED.md      # Detailed setup
    ├── PROJECT_SUMMARY.md      # What was built
    ├── DEVELOPMENT.md          # Dev guide
    ├── DEPLOYMENT.md           # Production guide
    └── README.md               # Original specs
```

## ✨ Features Implemented

### Core Application
- ✅ Modern chat interface with streaming AI responses
- ✅ Conversation history and persistence
- ✅ Settings page for configuration
- ✅ Dark mode support
- ✅ Responsive design

### AI Integration
- ✅ Claude Sonnet 4 via OpenRouter
- ✅ 13 function tools for external services
- ✅ Real-time streaming responses
- ✅ Token usage tracking

### Integrations
- ✅ **Google Calendar** (4 tools)
  - List events
  - Create events
  - Update events
  - Delete events

- ✅ **Google Tasks** (4 tools)
  - List tasks
  - Create tasks
  - Update tasks
  - Complete tasks

- ✅ **Notion** (5 tools)
  - Query databases
  - Create pages
  - Update pages
  - Append blocks
  - Get page details

### Security
- ✅ AES-256-GCM encryption for secrets
- ✅ OAuth 2.0 flows (Google & Notion)
- ✅ Encrypted credential storage
- ✅ Environment-based configuration

### Infrastructure
- ✅ Docker containerization
- ✅ Caddy reverse proxy with auto-HTTPS
- ✅ n8n workflow automation
- ✅ Redis queue management
- ✅ SQLite database with WAL mode

### DevOps
- ✅ Automated setup scripts
- ✅ Backup and restore system
- ✅ Health check endpoints
- ✅ Status monitoring
- ✅ Database migrations

## 🎯 Quick Reference

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/chat` | Main chat with AI |
| `GET /api/health` | Health check |
| `GET /api/status` | System status |
| `GET /api/conversations` | List conversations |
| `POST /api/settings/openrouter-key` | Save API key |
| `GET /api/auth/google` | Start Google OAuth |
| `GET /api/auth/notion` | Start Notion OAuth |

### Environment Variables

Essential variables in `.env`:
- `APP_ENCRYPTION_KEY` - For encrypting secrets (auto-generated)
- `DATABASE_URL` - SQLite database path
- `NEXTAUTH_SECRET` - Auth secret (auto-generated)
- `N8N_ENCRYPTION_KEY` - n8n encryption (auto-generated)
- `GOOGLE_CLIENT_ID/SECRET` - For Google OAuth (optional)
- `NOTION_CLIENT_ID/SECRET` - For Notion OAuth (optional)

### Scripts

| Script | Purpose |
|--------|---------|
| `install-prerequisites.sh` | Install Node, Docker, etc. |
| `setup.sh` | Initial project setup |
| `quick-start.sh` | Automated start |
| `verify-setup.sh` | Check system status |
| `backup.sh` | Create backup |
| `restore.sh` | Restore backup |

## 🚦 Status Indicators

After running `./scripts/verify-setup.sh`, you'll see:
- ✓ = Ready to use
- ✗ = Missing/needs setup
- ! = Warning/optional

## 📝 Common Tasks

### Start Development
```bash
cd /root/Hotz_AI_Lab/apps/web
npm run dev
# Access: http://localhost:3000
```

### Start Production (Docker)
```bash
cd /root/Hotz_AI_Lab
docker compose up -d
```

### View Logs
```bash
# Development: Check terminal
# Production:
docker compose logs -f
```

### Reset Database
```bash
rm data/sqlite/app.db
cd apps/web && npm run db:migrate
```

### Create Backup
```bash
./scripts/backup.sh
```

### Check Health
```bash
curl http://localhost:3000/api/health
```

## 🎓 Learning Resources

1. **For Users**: Start with [QUICK_START.md](QUICK_START.md)
2. **For Developers**: Read [DEVELOPMENT.md](DEVELOPMENT.md)
3. **For DevOps**: Read [DEPLOYMENT.md](DEPLOYMENT.md)
4. **For Architects**: Read [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)

## ❓ Troubleshooting

### Common Issues

**Can't run npm commands?**
→ Install Node.js: `sudo ./scripts/install-prerequisites.sh`

**Database errors?**
→ Reset database: `rm data/sqlite/app.db && cd apps/web && npm run db:migrate`

**Port 3000 in use?**
→ Use different port: `PORT=3001 npm run dev`

**OAuth not working?**
→ Check redirect URIs match in Google/Notion console

### Get Help

1. Run `./scripts/verify-setup.sh` to diagnose issues
2. Check the specific documentation file for your task
3. Review the error logs
4. Check environment variables in `.env`

## 🎉 What's Next?

Once you have the app running:

1. **Get OpenRouter API Key**
   - Go to https://openrouter.ai/
   - Sign up and get API key
   - Add in Settings page

2. **Connect Services** (Optional)
   - Set up Google OAuth
   - Set up Notion OAuth
   - Import n8n workflows

3. **Start Using**
   - Ask about your schedule
   - Create tasks
   - Manage Notion pages

## 📊 Project Statistics

- **27** TypeScript/JSON files created
- **13** AI function tools defined
- **6** n8n workflows templates
- **8** API route handlers
- **6** utility scripts
- **6** documentation files
- **4** Docker services configured

## 🔗 External Resources

- OpenRouter: https://openrouter.ai/
- Google Cloud Console: https://console.cloud.google.com/
- Notion Integrations: https://www.notion.so/my-integrations
- n8n Documentation: https://docs.n8n.io/

---

**Ready to start?** → Run `./scripts/quick-start.sh` and you'll be chatting with your AI assistant in minutes! 🚀


