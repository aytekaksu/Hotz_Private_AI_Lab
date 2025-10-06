import { getDb, closeDb } from './index';

function migrate() {
  console.log('Running database migrations...');
  
  const db = getDb();
  
  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      openrouter_api_key TEXT,
      google_oauth_token TEXT,
      google_refresh_token TEXT,
      notion_oauth_token TEXT,
      notion_refresh_token TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  
  // Create conversations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  // Create messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      tool_calls TEXT,
      token_count INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);
  
  // Create n8n_executions table (optional, for debugging)
  db.exec(`
    CREATE TABLE IF NOT EXISTS n8n_executions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success', 'error', 'running')),
      input TEXT,
      output TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    )
  `);
  
  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  `);
  
  console.log('Database migrations completed successfully!');
  
  closeDb();
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrate();
}

export { migrate };



