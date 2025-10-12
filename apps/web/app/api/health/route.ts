import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: false,
      environment: false,
    },
    details: {} as Record<string, any>,
  };

  // Check database
  try {
    const db = getDb();
    const result = db.prepare('SELECT 1 as test').get() as { test: number };
    checks.checks.database = result.test === 1;
    checks.details.database = 'Connected';
  } catch (error) {
    checks.checks.database = false;
    checks.details.database = error instanceof Error ? error.message : 'Connection failed';
  }

  // Check environment variables
  const requiredEnvVars = [
    'APP_ENCRYPTION_KEY',
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
  ];
  
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  checks.checks.environment = missingEnvVars.length === 0;
  checks.details.environment = missingEnvVars.length === 0 
    ? 'All required variables set'
    : `Missing: ${missingEnvVars.join(', ')}`;

  // Check optional OAuth configuration
  const optionalChecks = {
    google_oauth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    notion_oauth: !!(process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET),
  };
  checks.details.oauth = optionalChecks;

  // Overall status
  const allHealthy = Object.values(checks.checks).every(check => check);
  checks.status = allHealthy ? 'healthy' : 'degraded';

  const statusCode = allHealthy ? 200 : 503;

  return Response.json(checks, { status: statusCode });
}



