import { NextRequest } from 'next/server';
import { getAgentTools, setAgentToolEnabled, getOAuthCredential } from '@/lib/db';
import { toolMetadata } from '@/lib/tools/definitions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    if (!userId) return Response.json({ error: 'User ID required' }, { status: 400 });
    const defaults = getAgentTools(params.id);
    const tools = defaults.map((t) => {
      const meta = (toolMetadata as any)[t.tool_name];
      const requiresAuth = !!meta?.requiresAuth;
      const authProvider = meta?.authProvider || null;
      const authConnected = authProvider ? !!getOAuthCredential(userId, authProvider) : true;
      return {
        toolName: t.tool_name,
        enabled: t.enabled,
        available: requiresAuth ? authConnected : true,
        authProvider,
        description: meta?.description || t.tool_name,
        displayName: (t.tool_name || '').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        authConnected,
      };
    });
    return Response.json({ tools });
  } catch (error) {
    console.error('Error fetching agent tools:', error);
    return Response.json({ error: 'Failed to fetch agent tools' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { toolName, enabled } = body || {};
    if (!toolName || typeof enabled !== 'boolean') {
      return Response.json({ error: 'toolName and enabled required' }, { status: 400 });
    }
    setAgentToolEnabled(params.id, toolName, enabled);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error updating agent tool:', error);
    return Response.json({ error: 'Failed to update agent tool' }, { status: 500 });
  }
}

