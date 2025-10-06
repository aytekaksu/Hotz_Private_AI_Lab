# Getting Started with AI Assistant

This guide will help you get the AI Assistant application up and running.

## What Has Been Built

The following application has been created based on your specifications:

### ✅ Core Features Implemented

1. **Next.js Web Application**
   - Modern chat interface with streaming responses
   - Conversation history with persistence
   - Settings page for API keys and OAuth connections
   - Responsive design with dark mode support

2. **SQLite Database**
   - Complete schema for users, conversations, messages
   - Encrypted storage for API keys and OAuth tokens
   - Migration system for database setup
   - Optimized with WAL mode for better performance

3. **API Routes**
   - `/api/chat` - Main chat endpoint with AI streaming
   - `/api/auth/google` - Google OAuth flow
   - `/api/auth/notion` - Notion OAuth flow
   - `/api/conversations` - Conversation management
   - `/api/settings` - Settings management

4. **AI Tool Integration**
   - 13 tools defined for Claude Sonnet 4
   - Google Calendar: list, create, update, delete events
   - Google Tasks: list, create, update, complete tasks
   - Notion: query databases, create/update pages, append blocks
   - All tools execute via n8n workflows

5. **Security Features**
   - AES-256-GCM encryption for sensitive data
   - OAuth 2.0 flows for Google and Notion
   - Secure token storage
   - Environment-based configuration

6. **Docker Infrastructure**
   - Complete docker-compose.yml configuration
   - Caddy reverse proxy with automatic HTTPS
   - n8n workflow automation
   - Redis for queue management
   - Multi-container orchestration

7. **n8n Workflows**
   - 6 pre-configured workflow templates
   - Google Calendar integration
   - Google Tasks integration
   - Notion integration
   - Webhook-based execution

8. **Utilities & Scripts**
   - Setup script with automatic key generation
   - Backup and restore scripts
   - Database migration system

## Prerequisites Installation

Before you can run the application, you need to install:

### 1. Node.js 20+

```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 2. Docker & Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt-get install docker-compose-plugin

# Add your user to docker group
sudo usermod -aG docker $USER

# Verify installation
docker --version
docker compose version
```

### 3. SQLite3 (usually pre-installed)

```bash
sudo apt-get install sqlite3
```

## Quick Start

### Option 1: Development Mode (Local Testing)

1. **Install Dependencies**
   ```bash
   cd /root/Hotz_AI_Lab/apps/web
   npm install
   ```

2. **Initialize Database**
   ```bash
   npm run db:migrate
   ```

3. **Configure Environment**
   
   Edit `.env` file to set development URLs:
   ```bash
   nano /root/Hotz_AI_Lab/.env
   ```
   
   Update these values:
   ```
   NODE_ENV=development
   NEXTAUTH_URL=http://localhost:3000
   DATABASE_URL=file:///root/Hotz_AI_Lab/data/sqlite/app.db
   N8N_WEBHOOK_URL=http://localhost:5678/webhook
   ```

4. **Get OpenRouter API Key**
   
   - Go to https://openrouter.ai/
   - Sign up and get an API key
   - You'll add this in the app settings page after starting

5. **Start Development Server**
   ```bash
   npm run dev
   ```

6. **Access the Application**
   
   Open your browser to: http://localhost:3000

7. **Configure in the App**
   - Go to Settings (click ⚙️ Settings button)
   - Enter your OpenRouter API key
   - (Optional) Connect Google and Notion accounts

### Option 2: Production Mode (Docker)

1. **Configure Environment**
   
   Edit `.env` file:
   ```bash
   nano /root/Hotz_AI_Lab/.env
   ```
   
   You need to set:
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (see OAuth Setup below)
   - `NOTION_CLIENT_ID` and `NOTION_CLIENT_SECRET` (see OAuth Setup below)
   - `INTERNAL_DOMAIN` (your domain, e.g., assistant.example.com)
   - `NEXTAUTH_URL` (https://your-domain)
   - `CLOUDFLARE_API_TOKEN` (if using Cloudflare for DNS)

2. **Install Dependencies** (needed for build)
   ```bash
   cd /root/Hotz_AI_Lab/apps/web
   npm install
   ```

3. **Build and Start Services**
   ```bash
   cd /root/Hotz_AI_Lab
   docker compose up -d
   ```

4. **Check Status**
   ```bash
   docker compose ps
   docker compose logs -f
   ```

5. **Access the Application**
   
   - Main app: https://your-domain
   - n8n UI: https://n8n.your-domain

## OAuth Setup (Optional but Recommended)

### Google Cloud Console

1. Go to https://console.cloud.google.com/
2. Create a new project
3. Enable APIs:
   - Google Calendar API
   - Google Tasks API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Application type: "Web application"
6. Authorized redirect URIs:
   - For dev: `http://localhost:3000/api/auth/google/callback`
   - For prod: `https://your-domain/api/auth/google/callback`
7. Copy Client ID and Client Secret to `.env`

### Notion

1. Go to https://www.notion.so/my-integrations
2. Create a new integration
3. Type: "Public"
4. Redirect URIs:
   - For dev: `http://localhost:3000/api/auth/notion/callback`
   - For prod: `https://your-domain/api/auth/notion/callback`
5. Copy Client ID and Client Secret to `.env`

## Project Structure

```
/root/Hotz_AI_Lab/
├── apps/
│   ├── web/                          # Next.js application
│   │   ├── app/                      # App router
│   │   │   ├── api/                  # API routes
│   │   │   ├── page.tsx              # Main chat UI
│   │   │   └── settings/page.tsx     # Settings page
│   │   ├── lib/                      # Core libraries
│   │   │   ├── db/                   # Database layer
│   │   │   ├── tools/                # AI tool definitions
│   │   │   ├── encryption.ts         # Encryption utilities
│   │   │   └── n8n-client.ts         # n8n integration
│   │   └── package.json
│   └── n8n/
│       └── workflows/                # n8n workflow templates
├── data/                             # Runtime data
│   └── sqlite/                       # SQLite databases
├── scripts/                          # Utility scripts
│   ├── setup.sh                      # Initial setup
│   ├── backup.sh                     # Backup script
│   └── restore.sh                    # Restore script
├── docker-compose.yml                # Docker orchestration
├── Caddyfile                         # Reverse proxy config
├── .env                              # Environment variables
├── README.md                         # Original specifications
├── DEPLOYMENT.md                     # Deployment guide
├── DEVELOPMENT.md                    # Development guide
└── GETTING_STARTED.md                # This file
```

## Next Steps

1. **Install Node.js** (if not already installed)
2. **Choose development or production mode** (see above)
3. **Get an OpenRouter API key** from https://openrouter.ai/
4. **Start the application**
5. **Configure OAuth** (optional, for Google/Notion integration)
6. **Import n8n workflows** (if using production mode)

## Testing the Application

Once running, try these commands in the chat:

1. **Without OAuth** (just to test the chat interface):
   - "Hello, can you help me?"
   - "What can you do?"

2. **With Google Calendar connected**:
   - "What meetings do I have this week?"
   - "Schedule a meeting for tomorrow at 2pm"

3. **With Google Tasks connected**:
   - "Show me my tasks"
   - "Add a task to buy groceries"

4. **With Notion connected**:
   - "Show me pages in my Projects database"
   - "Create a new page titled 'New Project'"

## Troubleshooting

### Can't access localhost:3000

- Check if the dev server is running
- Check firewall rules
- Try accessing from the server itself: `curl http://localhost:3000`

### Database errors

```bash
# Reset database
rm /root/Hotz_AI_Lab/data/sqlite/app.db
cd /root/Hotz_AI_Lab/apps/web
npm run db:migrate
```

### Missing environment variables

Make sure `.env` file exists and has all required values:
```bash
cat /root/Hotz_AI_Lab/.env
```

### Docker build fails

```bash
# Clean up and rebuild
docker compose down
docker system prune -af
docker compose up -d --build
```

## Documentation

- **DEPLOYMENT.md** - Full production deployment guide
- **DEVELOPMENT.md** - Development workflow and architecture
- **README.md** - Original project specifications

## Support

For detailed information about each component, refer to:
- Database schema: `apps/web/lib/db/migrate.ts`
- API routes: `apps/web/app/api/`
- Tool definitions: `apps/web/lib/tools/definitions.ts`
- n8n workflows: `apps/n8n/workflows/`

## What's NOT Included Yet

The following features from the spec were not implemented in this initial version:
- WireGuard VPN setup (manual setup required)
- Advanced authentication system (currently uses simple user ID)
- Email integration
- Voice input/output
- Mobile app
- Advanced analytics
- Token usage tracking UI
- Multi-user support with teams

These can be added in future iterations as needed.



