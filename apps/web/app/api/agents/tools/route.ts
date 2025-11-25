import { getOAuthCredential } from '@/lib/db';
import { toolMetadata } from '@/lib/tools/definitions';
import { protectedRoute } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = protectedRoute(async (_req, user) => {
  const entries = Object.entries(toolMetadata);
  const tools = entries.map(([toolName, meta]) => {
    const requiresAuth = !!meta.requiresAuth;
    const authProvider = meta.authProvider || null;
    let authConnected = true;
    if (authProvider) {
      try {
        authConnected = !!getOAuthCredential(user.id, authProvider);
      } catch (e) {
        // If database access fails here, do not crash; assume not connected.
        authConnected = false;
      }
    }
    return {
      toolName,
      displayName: meta.displayName,
      description: (meta as any).description ?? meta.displayName,
      category: meta.category,
      authProvider,
      available: requiresAuth ? authConnected : true,
      authConnected,
      enabled: false,
    };
  });

  return { tools };
});
