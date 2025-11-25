import { NextRequest } from 'next/server';
import { getAgentTools, setAgentToolEnabled, getOAuthCredential, getAgentById } from '@/lib/db';
import { toolMetadata } from '@/lib/tools/definitions';
import { getSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Verify the agent belongs to the authenticated user
    const agent = getAgentById(params.id);
    if (!agent || agent.user_id !== sessionUser.id) {
      return Response.json({ error: 'Agent not found' }, { status: 404 });
    }
    
    const stored = getAgentTools(params.id);
    const storedMap = new Map(stored.map((t) => [t.tool_name, t.enabled]));
    const entries = Object.entries(toolMetadata as any);
    const tools = entries.map(([toolName, meta]: any) => {
      const requiresAuth = !!meta?.requiresAuth;
      const authProvider = meta?.authProvider || null;
      const authConnected = authProvider ? !!getOAuthCredential(sessionUser.id, authProvider) : true;
      const category = meta?.category || 'Other';
      // Default enabled logic: system date/time is enabled by default unless explicitly disabled
      const defaultEnabled = toolName === 'get_current_datetime' ? true : false;
      const enabled = storedMap.has(toolName) ? !!storedMap.get(toolName) : defaultEnabled;
      return {
        toolName,
        enabled,
        available: requiresAuth ? authConnected : true,
        authProvider,
        description: meta?.description || toolName,
        displayName: meta?.displayName || (toolName || '').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        authConnected,
        category,
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
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Verify the agent belongs to the authenticated user
    const agent = getAgentById(params.id);
    if (!agent || agent.user_id !== sessionUser.id) {
      return Response.json({ error: 'Agent not found' }, { status: 404 });
    }
    
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
