import { NextRequest } from 'next/server';
import { getDb, getGoogleOAuthConfigSummary, GoogleOAuthConfigSummary } from '@/lib/db';
import { route } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fallbackGoogleSummary = (): GoogleOAuthConfigSummary => ({
  configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  source: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? 'env' : null,
  projectId: process.env.GOOGLE_PROJECT_ID ?? null,
  clientId: process.env.GOOGLE_CLIENT_ID ?? undefined,
  updatedAt: null,
  redirectUriCount: undefined,
  canDelete: false,
});

const safeGoogleSummary = (): GoogleOAuthConfigSummary => {
  try {
    return getGoogleOAuthConfigSummary();
  } catch (error) {
    console.warn('Failed to load Google OAuth configuration summary:', error);
    return fallbackGoogleSummary();
  }
};

const countRows = (db: ReturnType<typeof getDb>, table: string) => {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${table}`);
  return (stmt.get() as { count: number }).count;
};

const countSince = (db: ReturnType<typeof getDb>, table: string, since: string) => {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE created_at > ?`);
  return (stmt.get(since) as { count: number }).count;
};

const notionConfigured = (db: ReturnType<typeof getDb>) => {
  try {
    const row = db
      .prepare('SELECT 1 as configured FROM oauth_credentials WHERE provider = ? LIMIT 1')
      .get('notion') as { configured?: number } | undefined;
    return !!row;
  } catch (error) {
    console.warn('Failed to evaluate Notion configuration state:', error);
    return false;
  }
};

const userConnections = (db: ReturnType<typeof getDb>, userId: string | null) => {
  if (!userId) {
    return {
      googleConnected: false,
      googleEmail: null as string | null,
      notionConnected: !!process.env.NOTION_INTEGRATION_SECRET,
    };
  }

  let googleConnected = false;
  let googleEmail: string | null = null;
  try {
    const row = db
      .prepare('SELECT account_email FROM oauth_credentials WHERE user_id = ? AND provider = ?')
      .get(userId, 'google') as { account_email?: string } | undefined;
    if (row) {
      googleConnected = true;
      if (typeof row.account_email === 'string') {
        googleEmail = row.account_email;
      }
    }
  } catch {
    const legacy = db
      .prepare('SELECT id FROM oauth_credentials WHERE user_id = ? AND provider = ?')
      .get(userId, 'google');
    googleConnected = !!legacy;
  }

  let notionConnected = !!process.env.NOTION_INTEGRATION_SECRET;
  try {
    const notionRow = db
      .prepare('SELECT id FROM oauth_credentials WHERE user_id = ? AND provider = ?')
      .get(userId, 'notion');
    notionConnected = notionConnected || !!notionRow;
  } catch {
    // Ignore errors while checking notion connection for a user
  }

  return { googleConnected, googleEmail, notionConnected };
};

export const GET = route((req: NextRequest) => {
  const userId = req.nextUrl.searchParams.get('userId');
  const db = getDb();
  const googleSummary = safeGoogleSummary();
  const statsWindow = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { googleConnected, googleEmail, notionConnected } = userConnections(db, userId);

  return {
    status: 'operational',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      type: 'SQLite',
      users: countRows(db, 'users'),
      conversations: countRows(db, 'conversations'),
      messages: countRows(db, 'messages'),
    },
    activity_24h: {
      new_conversations: countSince(db, 'conversations', statsWindow),
      new_messages: countSince(db, 'messages', statsWindow),
    },
    features: {
      openrouter: !!process.env.APP_ENCRYPTION_KEY,
      google_oauth: googleSummary.configured,
      notion_private_integration: notionConfigured(db) || !!process.env.NOTION_INTEGRATION_SECRET,
    },
    google_client: {
      configured: googleSummary.configured,
      source: googleSummary.source,
      project_id: googleSummary.projectId ?? null,
      client_id_suffix: googleSummary.clientId ? googleSummary.clientId.slice(-8) : null,
      updated_at: googleSummary.updatedAt ?? null,
    },
    google_connected: googleConnected,
    notion_connected: notionConnected,
    google_email: googleEmail,
  };
});
