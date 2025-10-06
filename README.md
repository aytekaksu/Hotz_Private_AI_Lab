# AI Assistant Project - Complete Technical Specification

## Project Overview

A private, self-hosted AI assistant web application that integrates with Google Calendar, Google Tasks, and Notion. The application provides a conversational interface for managing data across these services, with full user control over AI costs and complete privacy through VPN-only access.

## Core Requirements

### User Experience Goals
- **Secure OAuth Integration**: One-time setup flow to connect Google (Calendar + Tasks) and Notion accounts
- **Natural Language Interface**: Chat-based UI where users type commands in plain English
- **Direct Cost Control**: Users provide their own OpenRouter API key, paying directly for AI usage with full transparency
- **Private Access**: Application accessible only via VPN, never exposed to public internet
- **Self-Deployment Ready**: Client can deploy entire stack on their own rented VPS

### Example Use Cases
- "Summarize my meetings from last week and list corresponding action items from my tasks"
- "Add 'Finalize Q3 report' to my Google Tasks for tomorrow"
- "Schedule a 2-hour block for deep work this Friday afternoon"
- "Create a new page in my 'Projects' database titled 'New Marketing Initiative' with these to-do items..."

## Technical Stack

### Core Technologies
- **Language**: TypeScript for entire stack (frontend + backend)
- **Database**: SQLite (single-file database for simplicity and portability)
- **AI Model**: Claude Sonnet 4 via OpenRouter API
- **Frontend Framework**: Vercel AI SDK "ai-chatbot" template (forked and customized)
- **Integration Engine**: Self-hosted n8n (workflow automation)
- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Caddy (automatic HTTPS with DNS-01 challenge)
- **VPN**: WireGuard for network access control
- **Queue/Cache**: Redis (for n8n queue mode and optional caching)

### Architecture Components

```
┌─────────────┐
│   Client    │ ←─── VPN Connection (WireGuard)
│  (Browser)  │
└──────┬──────┘
       │
       │ HTTPS (via Caddy)
       │
┌──────▼──────────────────────────────────┐
│         Private VPS                      │
│                                          │
│  ┌────────────┐      ┌──────────────┐  │
│  │   Caddy    │──────│  Next.js App │  │
│  │  (Proxy)   │      │  (Chat UI)   │  │
│  └────────────┘      └───────┬──────┘  │
│                              │          │
│                              │          │
│  ┌───────────────────────────▼───────┐ │
│  │         n8n Engine               │ │
│  │  (Main + Worker in Queue Mode)  │ │
│  └───────┬──────────────────────────┘ │
│          │                             │
│    ┌─────▼─────┐    ┌──────────┐     │
│    │  SQLite   │    │  Redis   │     │
│    │    DB     │    │ (Queue)  │     │
│    └───────────┘    └──────────┘     │
│                                       │
└───────────────────────────────────────┘
         │              │           │
         │              │           │
    ┌────▼───┐    ┌────▼────┐  ┌──▼─────┐
    │ Google │    │ Notion  │  │OpenRouter│
    │Calendar│    │   API   │  │   API    │
    └────────┘    └─────────┘  └──────────┘
```

## Database Design

### Technology: SQLite

**Rationale for SQLite**:
- Single-file database (easy backups and portability)
- Zero configuration needed
- Sufficient for single-user or small team usage
- Built-in with most environments
- No separate database server to manage

### Required Tables

#### `users`
- `id` (TEXT, PRIMARY KEY) - UUID
- `email` (TEXT, UNIQUE, NOT NULL)
- `openrouter_api_key` (TEXT, ENCRYPTED) - User's OpenRouter API key
- `google_oauth_token` (TEXT, ENCRYPTED) - OAuth token for Google services
- `google_refresh_token` (TEXT, ENCRYPTED)
- `notion_oauth_token` (TEXT, ENCRYPTED)
- `notion_refresh_token` (TEXT, ENCRYPTED)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME)

#### `conversations`
- `id` (TEXT, PRIMARY KEY) - UUID
- `user_id` (TEXT, FOREIGN KEY → users.id)
- `title` (TEXT) - Auto-generated from first message
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

#### `messages`
- `id` (TEXT, PRIMARY KEY) - UUID
- `conversation_id` (TEXT, FOREIGN KEY → conversations.id)
- `role` (TEXT) - 'user' | 'assistant' | 'system'
- `content` (TEXT)
- `tool_calls` (JSON, NULLABLE) - Structured tool invocations
- `token_count` (INTEGER, NULLABLE) - For cost tracking
- `created_at` (DATETIME)

#### `n8n_executions` (optional, for debugging)
- `id` (TEXT, PRIMARY KEY)
- `workflow_id` (TEXT)
- `status` (TEXT) - 'success' | 'error' | 'running'
- `input` (JSON)
- `output` (JSON)
- `error` (TEXT, NULLABLE)
- `started_at` (DATETIME)
- `finished_at` (DATETIME, NULLABLE)

### Encryption Requirements
- All OAuth tokens and API keys MUST be encrypted at rest
- Use `N8N_ENCRYPTION_KEY` for n8n credential storage
- Use a separate `APP_ENCRYPTION_KEY` for application-level secrets in SQLite
- Store encryption keys in Docker secrets or secure environment variables

## Integration Specifications

### 1. OpenRouter Integration

**Purpose**: Unified AI model access with provider routing and fallback

**Implementation Requirements**:
- Accept user's API key via Settings page
- Store encrypted in `users.openrouter_api_key`
- Use Vercel AI SDK's OpenRouter provider adapter
- Primary model: `anthropic/claude-4.5-sonnet` (or latest Claude Sonnet 4 identifier)
- Enable tool calling for Google/Notion operations
- Implement retry logic with exponential backoff
- Log token usage per message for cost transparency

**API Endpoints to Use**:
- Chat completions: `https://openrouter.ai/api/v1/chat/completions`
- Health check: `https://openrouter.ai/api/v1/health`

**Provider Switching Strategy**:
- Create `ProviderAdapter` interface supporting: `openrouter`, `anthropic-direct`
- Allow future expansion to `fireworks`, `aws-bedrock`
- Default to OpenRouter with auto-router fallback enabled

### 2. Google Calendar Integration

**OAuth Configuration**:
- Scopes required:
  - `https://www.googleapis.com/auth/calendar.readonly`
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/tasks`
- Redirect URI: `https://<internal-hostname>/auth/google/callback` (must be HTTPS)
- Store access + refresh tokens encrypted in database

**n8n Workflows to Implement**:
1. **List Events** (`google-calendar-list-events`)
   - Input: Start date, end date, calendar ID (optional)
   - Output: Array of events with title, time, attendees, description
   
2. **Create Event** (`google-calendar-create-event`)
   - Input: Title, start/end time, attendees, description, location
   - Output: Created event object with ID
   
3. **Update Event** (`google-calendar-update-event`)
   - Input: Event ID, updated fields
   - Output: Updated event object

4. **Delete Event** (`google-calendar-delete-event`)
   - Input: Event ID
   - Output: Success confirmation

### 3. Google Tasks Integration

**OAuth Configuration**:
- Uses same OAuth flow as Calendar (scope: `https://www.googleapis.com/auth/tasks`)

**n8n Workflows to Implement**:
1. **List Tasks** (`google-tasks-list-tasks`)
   - Input: Task list ID (optional, default is primary)
   - Output: Array of tasks with title, due date, status, notes
   
2. **Create Task** (`google-tasks-create-task`)
   - Input: Title, due date, notes, parent task ID (optional)
   - Output: Created task object
   
3. **Update Task** (`google-tasks-update-task`)
   - Input: Task ID, updated fields
   - Output: Updated task object
   
4. **Complete Task** (`google-tasks-complete-task`)
   - Input: Task ID
   - Output: Success confirmation

### 4. Notion Integration

**OAuth Configuration**:
- Scopes required:
  - Read content
  - Update content
  - Insert content
- Redirect URI: `https://<internal-hostname>/auth/notion/callback`
- Store access token encrypted (Notion tokens don't expire but can be revoked)

**n8n Workflows to Implement**:
1. **Query Database** (`notion-query-database`)
   - Input: Database ID, filter criteria, sort options
   - Output: Array of page objects matching query
   
2. **Create Page** (`notion-create-page`)
   - Input: Parent (database/page ID), properties object, content blocks
   - Output: Created page object with ID
   
3. **Update Page** (`notion-update-page`)
   - Input: Page ID, properties to update
   - Output: Updated page object
   
4. **Append Blocks** (`notion-append-blocks`)
   - Input: Page ID, array of block objects to append
   - Output: Success confirmation

5. **Get Page** (`notion-get-page`)
   - Input: Page ID
   - Output: Complete page object with properties and content

## Frontend Specifications

### Base: Vercel AI SDK Chatbot Template

**Starting Point**: Fork `vercel/ai-chatbot` repository
- Keep core chat functionality (streaming, message history, tool calling)
- Keep React Server Components architecture
- Remove any Vercel-specific deployment configs (replace with Docker setup)

**Required Customizations**:

1. **Settings Page** (`/settings`)
   - Form fields:
     - OpenRouter API key (password input, shows "Set" when configured)
     - Link to OpenRouter dashboard: `https://openrouter.ai/activity`
     - Google OAuth connection status with "Connect" button
     - Notion OAuth connection status with "Connect" button
   - Save settings securely to SQLite
   
2. **OAuth Callback Routes**:
   - `/auth/google/callback` - Handle Google OAuth redirect
   - `/auth/notion/callback` - Handle Notion OAuth redirect
   - Both should exchange code for tokens and store encrypted in database
   
3. **Tool Integration Display**:
   - Show visual feedback when AI invokes tools (e.g., "Searching calendar...", "Creating task...")
   - Display structured results from tools in readable format
   - Handle errors gracefully with user-friendly messages

4. **Streaming & Token Counting**:
   - Maintain real-time streaming of AI responses
   - Track tokens per message for cost transparency
   - Store token counts in `messages` table

### UI/UX Requirements
- Dark mode support (optional but recommended)
- Responsive design (desktop-first, mobile-friendly)
- Loading states for all async operations
- Toast notifications for errors/success messages
- Conversation history sidebar
- New conversation button
- Clear conversation button (with confirmation)

## Backend API Specifications

### Technology: Next.js API Routes (App Router)

### Required Endpoints

#### **POST `/api/chat`**
Main chat endpoint using Vercel AI SDK's streaming
- **Input**: Message content, conversation ID, user ID
- **Process**:
  1. Validate user's OpenRouter API key exists
  2. Stream request to OpenRouter with Claude Sonnet 4
  3. If AI invokes tools, trigger corresponding n8n workflow via HTTP
  4. Stream tool results back to AI for final response
  5. Save all messages and tool calls to SQLite
- **Output**: Streaming text/event-stream response

#### **GET `/api/conversations`**
List user's conversations
- **Input**: User ID (from session)
- **Output**: Array of conversations with metadata

#### **GET `/api/conversations/:id`**
Get full conversation history
- **Input**: Conversation ID
- **Output**: Conversation object with all messages

#### **DELETE `/api/conversations/:id`**
Delete conversation
- **Input**: Conversation ID
- **Output**: Success confirmation

#### **POST `/api/settings/openrouter-key`**
Save/update OpenRouter API key
- **Input**: Encrypted API key
- **Output**: Success confirmation

#### **GET `/api/auth/google`**
Initiate Google OAuth flow
- **Output**: Redirect to Google consent screen

#### **GET `/api/auth/google/callback`**
Handle Google OAuth callback
- **Input**: Authorization code (query param)
- **Process**: Exchange for tokens, store encrypted
- **Output**: Redirect to settings with success message

#### **GET `/api/auth/notion`**
Initiate Notion OAuth flow
- **Output**: Redirect to Notion consent screen

#### **GET `/api/auth/notion/callback`**
Handle Notion OAuth callback
- **Input**: Authorization code (query param)
- **Process**: Exchange for token, store encrypted
- **Output**: Redirect to settings with success message

#### **POST `/api/tools/:toolName`**
Internal endpoint to trigger n8n workflows
- **Input**: Tool parameters (varies by tool)
- **Process**: 
  1. Validate user has proper OAuth tokens
  2. Call corresponding n8n webhook with parameters
  3. Return structured result
- **Output**: Tool execution result (JSON)

## n8n Workflow Specifications

### Setup Requirements
- Run n8n in **queue mode** with Redis for reliability
- Use **SQLite database** for n8n's internal data (workflows, credentials, executions)
- Set `N8N_ENCRYPTION_KEY` environment variable for credential encryption
- Enable webhooks: `N8N_WEBHOOK_URL=https://<internal-hostname>/n8n/webhook`
- Configure basic auth for n8n UI access via Caddy

### Workflow Structure Pattern

Each workflow should follow this structure:
1. **Webhook Trigger** - Receives parameters from Next.js API
2. **Credential Check** - Validate OAuth tokens are present and valid
3. **API Call** - Make authenticated request to Google/Notion
4. **Error Handling** - Catch and format errors appropriately
5. **Response** - Return structured JSON result

### Google Calendar Workflows

#### `google-calendar-list-events`
```json
{
  "trigger": "webhook",
  "nodes": [
    {
      "type": "Google Calendar",
      "operation": "Get All",
      "parameters": {
        "calendar": "primary",
        "startDate": "={{ $json.start_date }}",
        "endDate": "={{ $json.end_date }}"
      }
    }
  ]
}
```

#### `google-calendar-create-event`
```json
{
  "trigger": "webhook",
  "nodes": [
    {
      "type": "Google Calendar",
      "operation": "Create",
      "parameters": {
        "calendar": "primary",
        "summary": "={{ $json.title }}",
        "start": "={{ $json.start_time }}",
        "end": "={{ $json.end_time }}",
        "description": "={{ $json.description }}",
        "attendees": "={{ $json.attendees }}"
      }
    }
  ]
}
```

### Google Tasks Workflows

#### `google-tasks-list-tasks`
```json
{
  "trigger": "webhook",
  "nodes": [
    {
      "type": "Google Tasks",
      "operation": "Get All",
      "parameters": {
        "taskList": "={{ $json.task_list_id || '@default' }}"
      }
    }
  ]
}
```

#### `google-tasks-create-task`
```json
{
  "trigger": "webhook",
  "nodes": [
    {
      "type": "Google Tasks",
      "operation": "Create",
      "parameters": {
        "taskList": "={{ $json.task_list_id || '@default' }}",
        "title": "={{ $json.title }}",
        "due": "={{ $json.due_date }}",
        "notes": "={{ $json.notes }}"
      }
    }
  ]
}
```

### Notion Workflows

#### `notion-query-database`
```json
{
  "trigger": "webhook",
  "nodes": [
    {
      "type": "Notion",
      "operation": "Database: Query",
      "parameters": {
        "databaseId": "={{ $json.database_id }}",
        "filters": "={{ $json.filters }}",
        "sorts": "={{ $json.sorts }}"
      }
    }
  ]
}
```

#### `notion-create-page`
```json
{
  "trigger": "webhook",
  "nodes": [
    {
      "type": "Notion",
      "operation": "Page: Create",
      "parameters": {
        "parent": {
          "database_id": "={{ $json.parent_id }}"
        },
        "properties": "={{ $json.properties }}",
        "children": "={{ $json.content_blocks }}"
      }
    }
  ]
}
```

## AI Model Tool Definitions

The AI model should have access to these tools (functions) to interact with services:

### Calendar Tools

```typescript
{
  name: "list_calendar_events",
  description: "Retrieve calendar events within a date range",
  parameters: {
    type: "object",
    properties: {
      start_date: { type: "string", format: "date-time" },
      end_date: { type: "string", format: "date-time" },
      calendar_id: { type: "string", optional: true }
    },
    required: ["start_date", "end_date"]
  }
}

{
  name: "create_calendar_event",
  description: "Create a new calendar event",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      start_time: { type: "string", format: "date-time" },
      end_time: { type: "string", format: "date-time" },
      description: { type: "string", optional: true },
      attendees: { type: "array", items: { type: "string" }, optional: true },
      location: { type: "string", optional: true }
    },
    required: ["title", "start_time", "end_time"]
  }
}
```

### Task Tools

```typescript
{
  name: "list_tasks",
  description: "Get all tasks from a task list",
  parameters: {
    type: "object",
    properties: {
      task_list_id: { type: "string", optional: true }
    }
  }
}

{
  name: "create_task",
  description: "Create a new task",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      due_date: { type: "string", format: "date", optional: true },
      notes: { type: "string", optional: true }
    },
    required: ["title"]
  }
}

{
  name: "complete_task",
  description: "Mark a task as completed",
  parameters: {
    type: "object",
    properties: {
      task_id: { type: "string" }
    },
    required: ["task_id"]
  }
}
```

### Notion Tools

```typescript
{
  name: "query_notion_database",
  description: "Search and filter pages in a Notion database",
  parameters: {
    type: "object",
    properties: {
      database_id: { type: "string" },
      filters: { type: "object", optional: true },
      sorts: { type: "array", optional: true }
    },
    required: ["database_id"]
  }
}

{
  name: "create_notion_page",
  description: "Create a new page in a Notion database or under a parent page",
  parameters: {
    type: "object",
    properties: {
      parent_id: { type: "string" },
      title: { type: "string" },
      properties: { type: "object", optional: true },
      content_blocks: { type: "array", optional: true }
    },
    required: ["parent_id", "title"]
  }
}

{
  name: "update_notion_page",
  description: "Update properties of an existing Notion page",
  parameters: {
    type: "object",
    properties: {
      page_id: { type: "string" },
      properties: { type: "object" }
    },
    required: ["page_id", "properties"]
  }
}
```

## Security Implementation

### VPN Configuration (WireGuard)

**Server Setup**:
```bash
# Install WireGuard
apt update && apt install wireguard

# Generate server keys
wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key

# Create /etc/wireguard/wg0.conf
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = <server_private_key>
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT

[Peer]
PublicKey = <client_public_key>
AllowedIPs = 10.0.0.2/32
```

**Client Configuration**:
```ini
[Interface]
PrivateKey = <client_private_key>
Address = 10.0.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = <server_public_key>
Endpoint = <vps_public_ip>:51820
AllowedIPs = 10.0.0.0/24
PersistentKeepalive = 25
```

### Caddy Configuration

**Caddyfile** (`/etc/caddy/Caddyfile`):
```caddy
# Main application
assistant.internal.domain {
    reverse_proxy nextjs:3000
    
    # TLS via DNS-01 challenge (no exposed HTTP)
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    
    # Rate limiting
    rate_limit {
        zone static {
            key static
            events 100
            window 1m
        }
    }
}

# n8n UI (basic auth protected)
n8n.internal.domain {
    reverse_proxy n8n:5678
    
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    
    basicauth {
        admin JDJhJDE0JExGdXNOcVBXWklTN0JwQXlBRFlsUWVIQXBINy9BTGdSZElmcFJKNHJ1YWlNUC9FcjNuemh1
    }
}
```

### OAuth Redirect URIs

**Google Cloud Console**:
- Authorized redirect URIs:
  - `https://assistant.internal.domain/auth/google/callback`
  - `https://assistant.internal.domain/api/auth/google/callback`

**Notion Integrations**:
- Redirect URI:
  - `https://assistant.internal.domain/auth/notion/callback`

### Encryption Keys Management

**Required Environment Variables**:
```bash
# Application encryption (for SQLite secrets)
APP_ENCRYPTION_KEY=<64-char-hex-string>

# n8n credential encryption
N8N_ENCRYPTION_KEY=<64-char-hex-string>

# OAuth secrets
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
NOTION_CLIENT_ID=<from-notion-integrations>
NOTION_CLIENT_SECRET=<from-notion-integrations>

# DNS API for Caddy TLS
CLOUDFLARE_API_TOKEN=<if-using-cloudflare>
```

**Generate Encryption Keys**:
```bash
# Generate a secure 256-bit key
openssl rand -hex 32
```

### Database Encryption

**Implementation** (using `better-sqlite3` with `sqlcipher`):
```typescript
import Database from 'better-sqlite3';
import crypto from 'crypto';

// Initialize with encryption key
const db = new Database('app.db', {
  key: process.env.APP_ENCRYPTION_KEY
});

// Encrypt sensitive fields before storage
function encryptField(plaintext: string): string {
  const key = Buffer.from(process.env.APP_ENCRYPTION_KEY!, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptField(ciphertext: string): string {
  const key = Buffer.from(process.env.APP_ENCRYPTION_KEY!, 'hex');
  const buffer = Buffer.from(ciphertext, 'base64');
  const iv = buffer.subarray(0, 16);
  const authTag = buffer.subarray(16, 32);
  const encrypted = buffer.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
```

## Docker Compose Configuration

### File Structure
```
project-root/
├── docker-compose.yml
├── .env.example
├── Caddyfile
├── apps/
│   ├── web/              # Next.js application
│   │   ├── Dockerfile
│   │   └── ...
│   └── n8n/
│       └── data/         # n8n workflows and data
├── data/
│   ├── sqlite/           # SQLite database files
│   ├── caddy/            # Caddy data
│   └── redis/            # Redis persistence
└── scripts/
    ├── backup.sh
    └── restore.sh
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "443:443"
      - "443:443/udp"  # For HTTP/3
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./data/caddy/data:/data
      - ./data/caddy/config:/config
    environment:
      - CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}
    networks:
      - app-network
    depends_on:
      - web
      - n8n

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - DATABASE_URL=file:///data/app.db
      - APP_ENCRYPTION_KEY=${APP_ENCRYPTION_KEY}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - NOTION_CLIENT_ID=${NOTION_CLIENT_ID}
      - NOTION_CLIENT_SECRET=${NOTION_CLIENT_SECRET}
      - N8N_WEBHOOK_URL=http://n8n:5678/webhook
      - NEXTAUTH_URL=https://assistant.internal.domain
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
    volumes:
      - ./data/sqlite:/data
    networks:
      - app-network
    depends_on:
      - redis
      - n8n

  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    environment:
      - DB_TYPE=sqlite
      - DB_SQLITE_DATABASE=/data/database.sqlite
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - N8N_WEBHOOK_URL=https://assistant.internal.domain/n8n/webhook
      - EXECUTIONS_PROCESS=main
      - QUEUE_BULL_REDIS_HOST=redis
      - QUEUE_BULL_REDIS_PORT=6379
      - N8N_METRICS=true
    volumes:
      - ./apps/n8n/data:/data
    networks:
      - app-network
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - ./data/redis:/data
    networks:
      - app-network

networks:
  app-network:
    driver: bridge

volumes:
  sqlite_data:
  n8n_data:
  caddy_data:
  redis_data:
```

### .env.example

```bash
# Application
NODE_ENV=production
APP_ENCRYPTION_KEY=                    # Generate: openssl rand -hex 32

# Database
DATABASE_URL=file:///data/app.db

# n8n
N8N_ENCRYPTION_KEY=                    # Generate: openssl rand -hex 32

# OAuth Providers
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=

# NextAuth
NEXTAUTH_URL=https://assistant.internal.domain
NEXTAUTH_SECRET=                       # Generate: openssl rand -hex 32

# DNS Provider (for Caddy TLS)
CLOUDFLARE_API_TOKEN=                  # If using Cloudflare DNS-01

# Internal Domains
INTERNAL_DOMAIN=assistant.internal.domain
N8N_DOMAIN=n8n.internal.domain
```

## Development Workflow

### Initial Setup on VPS

```bash
# 1. Clone repository to VPS
git clone <repo-url> /opt/ai-assistant
cd /opt/ai-assistant

# 2. Copy and configure environment
cp .env.example .env
nano .env  # Fill in all required values

# 3. Generate encryption keys
openssl rand -hex 32  # For APP_ENCRYPTION_KEY
openssl rand -hex 32  # For N8N_ENCRYPTION_KEY
openssl rand -hex 32  # For NEXTAUTH_SECRET

# 4. Set up WireGuard
./scripts/setup-wireguard.sh

# 5. Start services
docker compose up -d

# 6. Check logs
docker compose logs -f
```

### Using Cursor IDE on VPS

**Option 1: X11 Forwarding**
```bash
# On local machine with X server (VcXsrv on Windows)
ssh -X user@vps-ip
cursor /opt/ai-assistant
```

**Option 2: VS Code Remote SSH**
```bash
# Install "Remote - SSH" extension in VS Code/Cursor
# Connect to VPS via SSH
# Open /opt/ai-assistant folder
```

**Option 3: VNC Setup**
```bash
# On VPS
apt install tightvncserver
vncserver :1

# On local machine
# Connect with VNC client to vps-ip:5901
```

### Development Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f [service-name]

# Restart a service
docker compose restart web

# Rebuild after code changes
docker compose up -d --build web

# Access n8n UI
# Navigate to https://n8n.internal.domain (via VPN)

# Access application
# Navigate to https://assistant.internal.domain (via VPN)

# Backup database
./scripts/backup.sh

# Restore database
./scripts/restore.sh backup-file.tar.gz

# Stop all services
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v
```

## Deployment Checklist

### Pre-Deployment

- [ ] VPS provisioned and accessible via SSH
- [ ] Docker and Docker Compose installed
- [ ] WireGuard installed and configured
- [ ] Firewall configured (allow only WireGuard port + SSH)
- [ ] DNS records created for internal domains
- [ ] Google OAuth app created with correct redirect URIs
- [ ] Notion integration created with correct redirect URI
- [ ] OpenRouter account created
- [ ] All environment variables set in `.env`
- [ ] Encryption keys generated and secured
- [ ] Domain TLS certificates tested (Caddy DNS-01)

### Deployment Steps

1. **Clone Repository**
   ```bash
   git clone <repo> /opt/ai-assistant
   cd /opt/ai-assistant
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Fill in all values
   ```

3. **Initialize Database**
   ```bash
   docker compose run --rm web npm run db:migrate
   ```

4. **Start Services**
   ```bash
   docker compose up -d
   ```

5. **Import n8n Workflows**
   - Access n8n UI via VPN
   - Import workflow JSON files from `/apps/n8n/workflows/`
   - Configure Google/Notion credentials in n8n

6. **Test Application**
   - Connect via VPN
   - Access `https://assistant.internal.domain`
   - Complete OAuth flows for Google and Notion
   - Test chat functionality and tool calling

### Post-Deployment

- [ ] Set up automated backups (cron job)
- [ ] Configure log rotation
- [ ] Set up monitoring (optional: Prometheus + Grafana)
- [ ] Document WireGuard client setup for end users
- [ ] Create backup restore test plan
- [ ] Document common troubleshooting steps

## Backup & Recovery

### Automated Backup Script

**`scripts/backup.sh`**:
```bash
#!/bin/bash
set -e

BACKUP_DIR="/opt/backups/ai-assistant"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_${TIMESTAMP}.tar.gz"

mkdir -p $BACKUP_DIR

# Stop services to ensure consistent backup
docker compose stop

# Backup SQLite database
tar -czf "${BACKUP_DIR}/${BACKUP_FILE}" \
  data/sqlite/app.db \
  apps/n8n/data/database.sqlite \
  .env

# Restart services
docker compose start

# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete

echo "Backup created: ${BACKUP_DIR}/${BACKUP_FILE}"
```

### Restore Script

**`scripts/restore.sh`**:
```bash
#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./restore.sh <backup-file.tar.gz>"
  exit 1
fi

BACKUP_FILE=$1

# Stop services
docker compose down

# Extract backup
tar -xzf "$BACKUP_FILE" -C /

# Restart services
docker compose up -d

echo "Restore completed from: $BACKUP_FILE"
```

### Cron Job for Automated Backups

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /opt/ai-assistant/scripts/backup.sh >> /var/log/ai-assistant-backup.log 2>&1
```

## Monitoring & Logging

### Log Aggregation

**Configure Docker logging**:
```yaml
# In docker-compose.yml for each service
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

**View logs**:
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f web

# Last 100 lines
docker compose logs --tail=100 web
```

### Health Checks

**Add to Next.js app** (`/api/health`):
```typescript
export async function GET() {
  // Check database connection
  const dbOk = await checkDatabase();
  
  // Check n8n availability
  const n8nOk = await fetch('http://n8n:5678/healthz').then(r => r.ok);
  
  // Check Redis
  const redisOk = await checkRedis();
  
  if (dbOk && n8nOk && redisOk) {
    return Response.json({ status: 'healthy' }, { status: 200 });
  }
  
  return Response.json({ 
    status: 'unhealthy',
    db: dbOk,
    n8n: n8nOk,
    redis: redisOk
  }, { status: 503 });
}
```

## Troubleshooting Guide

### Common Issues

#### 1. OAuth Redirects Failing
**Symptoms**: OAuth flow redirects to wrong URL or shows error
**Solution**:
- Verify redirect URIs in Google Cloud Console / Notion match exactly
- Ensure HTTPS is working (check Caddy logs)
- Confirm VPN is connected
- Check `NEXTAUTH_URL` environment variable

#### 2. VPN Connection Issues
**Symptoms**: Cannot access internal domains
**Solution**:
- Verify WireGuard is running: `sudo wg show`
- Check allowed IPs in client config
- Ping VPN IP: `ping 10.0.0.1`
- Verify DNS resolution: `nslookup assistant.internal.domain`

#### 3. n8n Workflows Not Triggering
**Symptoms**: AI tool calls fail or timeout
**Solution**:
- Check n8n logs: `docker compose logs n8n`
- Verify webhooks are accessible from web service
- Confirm OAuth credentials are configured in n8n
- Test workflow manually in n8n UI

#### 4. Database Locked Errors
**Symptoms**: SQLite database locked errors in logs
**Solution**:
- SQLite doesn't handle high concurrency well
- Ensure only one writer at a time
- Consider adding a write queue if needed
- Check for long-running transactions

#### 5. OpenRouter API Errors
**Symptoms**: AI responses fail with API errors
**Solution**:
- Verify API key is correct and has credits
- Check OpenRouter status page
- Implement retry logic with exponential backoff
- Fall back to different provider if configured

## Performance Optimization

### SQLite Performance Tuning

**Pragmas to set**:
```typescript
db.pragma('journal_mode = WAL');  // Write-Ahead Logging
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000');  // 64MB cache
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 30000000000');  // 30GB memory map
```

### Redis Caching Strategy

**Cache frequently accessed data**:
- User OAuth tokens (with TTL matching token expiry)
- Recent conversation history
- Tool call results (short TTL)

**Example implementation**:
```typescript
async function getCachedOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = 300
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const fresh = await fetchFn();
  await redis.setex(key, ttl, JSON.stringify(fresh));
  return fresh;
}
```

### n8n Queue Mode Benefits

- Handles backpressure gracefully
- Retries failed workflows automatically
- Scales horizontally by adding workers
- Prevents memory issues with long-running workflows

## Testing Strategy

### Unit Tests
- Database models and encryption/decryption functions
- API route handlers (mock n8n calls)
- Tool call formatters and parsers
- OAuth token refresh logic

### Integration Tests
- Full OAuth flow (Google and Notion)
- End-to-end chat with tool calling
- n8n workflow execution
- Database migrations

### Manual Testing Checklist
- [ ] New user can complete OAuth setup
- [ ] Chat interface streams responses correctly
- [ ] Calendar events can be listed and created
- [ ] Tasks can be created and marked complete
- [ ] Notion pages can be queried and created
- [ ] Error messages are user-friendly
- [ ] Settings page saves API key correctly
- [ ] Conversation history persists across sessions
- [ ] VPN-only access is enforced
- [ ] Backup/restore works correctly

## Future Enhancements (Out of Scope for V1)

- Email integration (Gmail)
- File upload and analysis
- Voice input/output
- Mobile app
- Multi-user support with teams
- Advanced analytics dashboard
- Scheduled tasks/reminders
- Integration marketplace
- Custom workflow builder UI

---

## Quick Reference

### Key Files to Create

1. **`/apps/web/app/api/chat/route.ts`** - Main chat endpoint
2. **`/apps/web/app/api/tools/[toolName]/route.ts`** - Tool execution routes
3. **`/apps/web/lib/db.ts`** - SQLite database wrapper
4. **`/apps/web/lib/encryption.ts`** - Encryption utilities
5. **`/apps/web/lib/n8n-client.ts`** - n8n webhook caller
6. **`/apps/web/lib/openrouter.ts`** - OpenRouter API client
7. **`/apps/web/app/settings/page.tsx`** - Settings UI
8. **`/apps/web/app/auth/google/callback/route.ts`** - Google OAuth callback
9. **`/apps/web/app/auth/notion/callback/route.ts`** - Notion OAuth callback
10. **`/apps/n8n/workflows/*.json`** - n8n workflow definitions

### Environment Variables Checklist

```bash
✓ APP_ENCRYPTION_KEY
✓ N8N_ENCRYPTION_KEY
✓ NEXTAUTH_SECRET
✓ DATABASE_URL
✓ GOOGLE_CLIENT_ID
✓ GOOGLE_CLIENT_SECRET
✓ NOTION_CLIENT_ID
✓ NOTION_CLIENT_SECRET
✓ CLOUDFLARE_API_TOKEN (if using Cloudflare DNS)
✓ NEXTAUTH_URL
```

### First-Time Setup Commands

```bash
# 1. Clone and navigate
git clone <repo> /opt/ai-assistant && cd /opt/ai-assistant

# 2. Configure
cp .env.example .env && nano .env

# 3. Generate keys
openssl rand -hex 32  # Run 3 times for different keys

# 4. Setup VPN
./scripts/setup-wireguard.sh

# 5. Start
docker compose up -d

# 6. Check health
docker compose logs -f
curl -k https://assistant.internal.domain/api/health
```