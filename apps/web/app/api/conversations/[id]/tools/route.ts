import { NextRequest } from 'next/server';
import { getConversationById, getConversationTools, setConversationToolEnabled, getOAuthCredential } from '@/lib/db';
import { tools, toolMetadata, type ToolName } from '@/lib/tools/definitions';

export const runtime = 'nodejs';

type AccessResult =
  | { response: Response }
  | { userId: string; conversationId: string };

const ensureConversationAccess = (conversationId: string, userId: string | null): AccessResult => {
  if (!userId) {
    return { response: Response.json({ error: 'User ID required' }, { status: 400 }) };
  }

  const conversation = getConversationById(conversationId);
  if (!conversation) {
    return { response: Response.json({ error: 'Conversation not found' }, { status: 404 }) };
  }

  if (conversation.user_id !== userId) {
    return { response: Response.json({ error: 'Unauthorized' }, { status: 403 }) };
  }

  return { userId, conversationId };
};

const authErrorMessage = (provider: string | null | undefined) =>
  provider === 'notion'
    ? 'Notion integration secret not configured. Please add it in Settings.'
    : provider
      ? `${provider} account not connected. Please connect in Settings.`
      : 'Required account not connected. Please connect in Settings.';

const isProviderConnected = (
  userId: string,
  provider: 'google' | 'notion' | null | undefined,
  cache?: Map<string, boolean>,
): boolean => {
  if (!provider) return true;
  if (cache?.has(provider)) {
    return cache.get(provider)!;
  }
  let connected = !!getOAuthCredential(userId, provider);
  if (provider === 'notion') {
    connected = connected || !!process.env.NOTION_INTEGRATION_SECRET;
  }
  cache?.set(provider, connected);
  return connected;
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const result = ensureConversationAccess(params.id, req.nextUrl.searchParams.get('userId'));
    if ('response' in result) return result.response;

    const enabledMap = new Map(getConversationTools(result.conversationId).map((t) => [t.tool_name, t.enabled]));
    const authCache = new Map<string, boolean>();

    const toolsList = (Object.entries(toolMetadata) as Array<[ToolName, (typeof toolMetadata)[ToolName]]>)
      .filter(([, metadata]) => metadata.category !== 'System')
      .map(([toolName, metadata]) => {
        const authConnected = isProviderConnected(result.userId, metadata.authProvider, authCache);
        const available = !metadata.requiresAuth || authConnected;
        return {
          toolName,
          displayName: metadata.displayName,
          category: metadata.category,
          description: tools[toolName].description,
          enabled: enabledMap.get(toolName) || false,
          available,
          requiresAuth: metadata.requiresAuth,
          authProvider: metadata.authProvider,
          authConnected,
        };
      });

    return Response.json({ tools: toolsList });
  } catch (error) {
    console.error('Error fetching tools:', error);
    return Response.json({ error: 'Failed to fetch tools' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { toolName, enabled } = body ?? {};
    const result = ensureConversationAccess(params.id, body?.userId ?? null);
    if ('response' in result) return result.response;

    if (!toolName || typeof enabled !== 'boolean') {
      return Response.json({ error: 'Tool name and enabled status required' }, { status: 400 });
    }

    if (!(toolName in tools)) {
      return Response.json({ error: 'Invalid tool name' }, { status: 400 });
    }

    const metadata = toolMetadata[toolName as ToolName];
    if (metadata.requiresAuth && enabled && !isProviderConnected(result.userId, metadata.authProvider)) {
      return Response.json({ error: authErrorMessage(metadata.authProvider) }, { status: 400 });
    }

    setConversationToolEnabled(result.conversationId, toolName, enabled);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error updating tool:', error);
    return Response.json({ error: 'Failed to update tool' }, { status: 500 });
  }
}
