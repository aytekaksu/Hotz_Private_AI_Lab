import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

// Get current schema version
function getCurrentVersion(): number {
  const db = getDb();
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
  const db = getDb();
  db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, datetime(\'now\'))').run(version);
}

// Migration 2: Add conversation_tools table
function migration2() {
  const db = getDb();
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
}

const migrations = [migration2];

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const currentVersion = getCurrentVersion();
    console.log(`Current schema version: ${currentVersion}`);
    
    const migrationsToRun = migrations.slice(currentVersion - 1);
    
    if (migrationsToRun.length === 0) {
      return Response.json({
        success: true,
        message: 'Database is up to date',
        currentVersion
      });
    }
    
    console.log(`Running ${migrationsToRun.length} migration(s)...`);
    
    db.exec('BEGIN TRANSACTION');
    
    try {
      migrationsToRun.forEach((migration) => {
        migration();
      });
      
      db.exec('COMMIT');
      
      const newVersion = getCurrentVersion();
      console.log('✓ All migrations completed successfully');
      
      return Response.json({
        success: true,
        message: 'Migrations completed successfully',
        previousVersion: currentVersion,
        currentVersion: newVersion
      });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Migration failed:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Migration failed' },
      { status: 500 }
    );
  }
}

