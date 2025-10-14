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

    const current = getCurrentVersion();
    const toRun = [] as Array<() => void>;
    if (current < 1) toRun.push(migration1);
    if (current < 2) toRun.push(migration2);
    if (current < 3) toRun.push(migration3);

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
