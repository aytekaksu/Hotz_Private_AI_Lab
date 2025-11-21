import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const db = getDb();

    // helper: current version
    const getCurrentVersion = (): number => {
      try {
        const result = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number } | undefined;
        return result?.version || 0;
      } catch {
        return 0;
      }
    };
    const setVersion = (v: number) => {
      db.prepare("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)").run();
      db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, datetime('now'))").run(v);
    };

    const migration1 = () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          openrouter_api_key TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
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
        CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
        CREATE INDEX IF NOT EXISTS idx_oauth_credentials_user_provider ON oauth_credentials(user_id, provider);
      `);
      setVersion(1);
    };

    const migration2 = () => {
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
        CREATE INDEX IF NOT EXISTS idx_conversation_tools_conversation_id ON conversation_tools(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_conversation_tools_conversation_tool ON conversation_tools(conversation_id, tool_name);
      `);
      setVersion(2);
    };

    const migration3 = () => {
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
      try { db.exec(`ALTER TABLE conversations ADD COLUMN agent_id TEXT NULL REFERENCES agents(id) ON DELETE SET NULL;`); } catch {}
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
        CREATE INDEX IF NOT EXISTS idx_agents_user_slug ON agents(user_id, slug);
        CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agent_id);
      `);
      setVersion(3);
    };
    
    const migration4 = () => {
      try { db.exec("ALTER TABLE agents ADD COLUMN instructions_attachment_id TEXT NULL"); } catch {}
      try { db.exec("ALTER TABLE agents ADD COLUMN instructions_attachment_name TEXT NULL"); } catch {}
      setVersion(4);
    };

    const migration5 = () => {
      try { db.exec("ALTER TABLE users ADD COLUMN anthropic_api_key TEXT NULL"); } catch {}
      try { db.exec("ALTER TABLE users ADD COLUMN active_ai_provider TEXT NULL"); } catch {}
      try { db.exec("ALTER TABLE users ADD COLUMN default_model TEXT NULL"); } catch {}
      try { db.exec("ALTER TABLE users ADD COLUMN default_routing_variant TEXT NULL"); } catch {}
      setVersion(5);
    };

    const migration6 = () => {
      try { db.exec("ALTER TABLE oauth_credentials ADD COLUMN account_email TEXT NULL"); } catch {}
      setVersion(6);
    };

    const migration7 = () => {
      try {
        const columns = db.prepare('PRAGMA table_info(oauth_credentials);').all() as Array<{ name: string }>;
        const hasColumn = columns.some((col) => col.name === 'account_email');
        if (!hasColumn) {
          db.exec('ALTER TABLE oauth_credentials ADD COLUMN account_email TEXT NULL');
        }
      } catch (error) {
        console.error('Failed to add account_email column during migration 7:', error);
      }
      setVersion(7);
    };

    const migration8 = () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      setVersion(8);
    };

    const migration9 = () => {
      try { db.exec("ALTER TABLE attachments ADD COLUMN folder_path TEXT NULL"); } catch {}
      try { db.exec("ALTER TABLE attachments ADD COLUMN is_library INTEGER NOT NULL DEFAULT 0"); } catch {}
      try { db.exec("UPDATE attachments SET folder_path = COALESCE(folder_path, '/'), is_library = COALESCE(is_library, 0)"); } catch {}
      db.exec(`
        CREATE TABLE IF NOT EXISTS attachment_folders (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL UNIQUE,
          parent_path TEXT,
          created_at TEXT NOT NULL
        );
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_attachment_folders_parent ON attachment_folders(parent_path);');
      setVersion(9);
    };

    const migration10 = () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_default_files (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          attachment_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
          FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
        );
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_agent_default_files_agent ON agent_default_files(agent_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_agent_default_files_attachment ON agent_default_files(attachment_id)');
      setVersion(10);
    };

    const migration11 = () => {
      try { db.exec("ALTER TABLE attachments ADD COLUMN is_encrypted INTEGER NOT NULL DEFAULT 0"); } catch {}
      try { db.exec("ALTER TABLE attachments ADD COLUMN encryption_password_hash TEXT NULL"); } catch {}
      try { db.exec("UPDATE attachments SET is_encrypted = COALESCE(is_encrypted, 0)"); } catch {}
      setVersion(11);
    };

    const migration12 = () => {
      try { db.exec("ALTER TABLE attachments ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0"); } catch {}
      try { db.exec("UPDATE attachments SET failed_attempts = COALESCE(failed_attempts, 0)"); } catch {}
      setVersion(12);
    };

    try { db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;"); } catch {}
    const current = getCurrentVersion();
    const toRun = [] as Array<() => void>;
    if (current < 1) toRun.push(migration1);
    if (current < 2) toRun.push(migration2);
    if (current < 3) toRun.push(migration3);
    if (current < 4) toRun.push(migration4);
    if (current < 5) toRun.push(migration5);
    if (current < 6) toRun.push(migration6);
    if (current < 7) toRun.push(migration7);
    if (current < 8) toRun.push(migration8);
    if (current < 9) toRun.push(migration9);
    if (current < 10) toRun.push(migration10);
    if (current < 11) toRun.push(migration11);
    if (current < 12) toRun.push(migration12);

    if (toRun.length === 0) {
      return Response.json({ success: true, message: 'Database is up to date', currentVersion: current });
    }
    db.exec('BEGIN TRANSACTION');
    try {
      toRun.forEach((m) => m());
      db.exec('COMMIT');
      return Response.json({ success: true, message: 'Migrations completed', previousVersion: current, currentVersion: getCurrentVersion() });
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } catch (error) {
    console.error('Migration failed:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Migration failed' },
      { status: 500 }
    );
  }
}
