import path from 'path';

const DB_PATH = process.env.DATABASE_URL?.replace('file://', '') || path.join(process.cwd(), 'data', 'app.db');

console.log('Database migration starting...');
console.log('Database path:', DB_PATH);

// Create DB instance using Bun's sqlite when available, otherwise better-sqlite3
// Note: kept synchronous setup to work in both runtimes
let db: any;
try {
  // @ts-ignore
  const isBun = typeof (globalThis as any).Bun !== 'undefined';
  if (isBun) {
    // @ts-ignore - bun:sqlite is provided by Bun at runtime
    const { Database: BunDatabase } = require('bun:sqlite');
    db = new BunDatabase(DB_PATH);
  } else {
    // @ts-ignore - CJS require for Node
    const BetterSqlite3 = require('better-sqlite3');
    db = new BetterSqlite3(DB_PATH);
  }
} catch (e) {
  // Fallback to better-sqlite3
  // @ts-ignore
  const BetterSqlite3 = require('better-sqlite3');
  db = new BetterSqlite3(DB_PATH);
}

// Enable pragmas for consistency
try {
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;');
} catch {}

// Get current schema version
function getCurrentVersion(): number {
  try {
    const result = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number } | undefined;
    return result?.version || 0;
  } catch (error) {
    // Table doesn't exist, return 0
    return 0;
  }
}

// Set schema version
function setVersion(version: number): void {
  db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, datetime(\'now\'))').run(version);
}

// Migration functions
const migrations = [
  // Migration 1: Initial schema
  function migration1() {
    console.log('Running migration 1: Initial schema');
    
    // Schema version tracking
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    
    // Users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        openrouter_api_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    
    // Conversations table
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    
    // Messages table
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        tool_calls TEXT,
        tokens INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
    `);
    
    // Attachments table
    db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT,
        filename TEXT NOT NULL,
        mimetype TEXT NOT NULL,
        size INTEGER NOT NULL,
        path TEXT NOT NULL,
        text_content TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
      );
    `);
    
    // OAuth credentials table
    db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_credentials (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL CHECK(provider IN ('google', 'notion')),
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        scope TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, provider)
      );
    `);
    
    // Indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
      CREATE INDEX IF NOT EXISTS idx_oauth_credentials_user_provider ON oauth_credentials(user_id, provider);
    `);
    
    setVersion(1);
    console.log('✓ Migration 1 completed');
  },
  
  // Migration 2: Add conversation_tools table
  function migration2() {
    console.log('Running migration 2: Conversation tools');
    
    // Conversation tools table
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_tools (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        UNIQUE(conversation_id, tool_name)
      );
    `);
    
    // Index for efficient queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversation_tools_conversation_id ON conversation_tools(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_tools_conversation_tool ON conversation_tools(conversation_id, tool_name);
    `);
    
    setVersion(2);
    console.log('✓ Migration 2 completed');
  },
  
  // Migration 3: Agents and agent defaults + conversation agent link
  function migration3() {
    console.log('Running migration 3: Agents + agent tool defaults + conversation agent link');

    // Agents table
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        extra_system_prompt TEXT,
        override_system_prompt TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, slug)
      );
    `);

    // Agent default tools
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_tools (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        UNIQUE(agent_id, tool_name)
      );
    `);

    // Add agent_id to conversations if not exists
    try {
      db.exec(`ALTER TABLE conversations ADD COLUMN agent_id TEXT NULL REFERENCES agents(id) ON DELETE SET NULL;`);
    } catch (e) {
      // ignore if column exists
    }

    // Indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
      CREATE INDEX IF NOT EXISTS idx_agents_user_slug ON agents(user_id, slug);
      CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agent_id);
    `);

    setVersion(3);
    console.log('✓ Migration 3 completed');
  },
  
  // Migration 4: Add agent instructions attachment metadata
  function migration4() {
    console.log('Running migration 4: Agent instructions attachment columns');
    try {
      db.exec("ALTER TABLE agents ADD COLUMN instructions_attachment_id TEXT NULL");
    } catch {}
    try {
      db.exec("ALTER TABLE agents ADD COLUMN instructions_attachment_name TEXT NULL");
    } catch {}
    setVersion(4);
    console.log('✓ Migration 4 completed');
  },
  
  // Migration 5: User default model + routing variant
  function migration5() {
    console.log('Running migration 5: User default model + routing variant');
    try {
      db.exec("ALTER TABLE users ADD COLUMN default_model TEXT NULL");
    } catch {}
    try {
      db.exec("ALTER TABLE users ADD COLUMN default_routing_variant TEXT NULL");
    } catch {}
    setVersion(5);
    console.log('✓ Migration 5 completed');
  },
  
  // Migration 6: Anthropic key + active provider
  function migration6() {
    console.log('Running migration 6: Anthropic key + active provider');
    try {
      db.exec("ALTER TABLE users ADD COLUMN anthropic_api_key TEXT NULL");
    } catch {}
    try {
      db.exec("ALTER TABLE users ADD COLUMN active_ai_provider TEXT NULL");
    } catch {}
    setVersion(6);
    console.log('✓ Migration 6 completed');
  },
];

// Run migrations
function runMigrations() {
  const currentVersion = getCurrentVersion();
  console.log(`Current schema version: ${currentVersion}`);
  
  const migrationsToRun = migrations.slice(currentVersion);
  
  if (migrationsToRun.length === 0) {
    console.log('✓ Database is up to date');
    return;
  }
  
  console.log(`Running ${migrationsToRun.length} migration(s)...`);
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    migrationsToRun.forEach((migration) => {
      migration();
    });
    
    db.exec('COMMIT');
    console.log('✓ All migrations completed successfully');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('✗ Migration failed:', error);
    throw error;
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  try {
    runMigrations();
    db.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    db.close();
    process.exit(1);
  }
}

export { runMigrations };
