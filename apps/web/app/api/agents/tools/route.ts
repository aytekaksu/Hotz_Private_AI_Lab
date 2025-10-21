import { NextRequest } from 'next/server';
import { getOAuthCredential } from '@/lib/db';
import { toolMetadata } from '@/lib/tools/definitions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) return Response.json({ error: 'User ID required' }, { status: 400 });

    const entries = Object.entries(toolMetadata);
    const tools = entries.map(([toolName, meta]) => {
      const requiresAuth = !!meta.requiresAuth;
      const authProvider = meta.authProvider || null;
      let authConnected = true;
      if (authProvider) {
        try {
          authConnected = !!getOAuthCredential(userId, authProvider);
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

    return Response.json({ tools });
  } catch (error) {
    console.error('Error listing base agent tools:', error);
    // Return a best-effort static list if something goes wrong
    try {
      const entries = Object.entries(toolMetadata);
      const tools = entries.map(([toolName, meta]) => ({
        toolName,
        displayName: meta.displayName,
        description: (meta as any).description ?? meta.displayName,
        category: meta.category,
        authProvider: meta.authProvider || null,
        available: true,
        authConnected: false,
        enabled: false,
      }));
      return Response.json({ tools }, { status: 200 });
    } catch (e2) {
      return Response.json({ error: 'Failed to list tools' }, { status: 500 });
    }
  }
}
