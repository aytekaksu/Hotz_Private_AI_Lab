import { NextRequest } from 'next/server';
import { getDb, getGoogleOAuthConfigSummary } from '@/lib/db';
import { json, route } from '@/lib/api';

export const runtime = 'nodejs';

const REQUIRED_ENV_VARS = ['APP_ENCRYPTION_KEY', 'DATABASE_URL', 'NEXTAUTH_SECRET'] as const;

const defaultGoogleSummary = () => ({
  configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  source: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? 'env' : null,
});

const safeGoogleSummary = async () => {
  try {
    return await getGoogleOAuthConfigSummary();
  } catch (error) {
    console.warn('Failed to load Google OAuth configuration summary:', error);
    return defaultGoogleSummary();
  }
};

const checkDatabase = () => {
  try {
    const db = getDb();
    const result = db.prepare('SELECT 1 as test').get() as { test: number };
    return { ok: result?.test === 1, detail: 'Connected' };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'Connection failed',
    };
  }
};

const checkEnvironment = () => {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  return {
    ok: missing.length === 0,
    detail: missing.length === 0 ? 'All required variables set' : `Missing: ${missing.join(', ')}`,
  };
};

const checkOptionalOAuth = (googleSummary: { configured: boolean; source: string | null }) => {
  const optional: Record<string, boolean | string | null> = {
    google_oauth: googleSummary.configured,
    notion_private_integration: !!process.env.NOTION_INTEGRATION_SECRET,
    google_client_source: googleSummary.source,
  };

  try {
    const db = getDb();
    const notionRow = db
      .prepare('SELECT 1 as configured FROM oauth_credentials WHERE provider = ? LIMIT 1')
      .get('notion') as { configured?: number } | undefined;
    optional.notion_private_integration =
      (optional.notion_private_integration as boolean) || !!notionRow;
  } catch {
    // Database health already captured elsewhere.
  }

  return optional;
};

export const GET = route(async (_req: NextRequest) => {
  const googleSummary = await safeGoogleSummary();
  const dbStatus = checkDatabase();
  const envStatus = checkEnvironment();
  const optional = checkOptionalOAuth(googleSummary);
  const healthy = dbStatus.ok && envStatus.ok;

  const payload = {
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbStatus.ok,
      environment: envStatus.ok,
    },
    details: {
      database: dbStatus.detail,
      environment: envStatus.detail,
      oauth: optional,
    },
  };

  return json(payload, healthy ? 200 : 503);
});
