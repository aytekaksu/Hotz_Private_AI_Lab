import { NextRequest } from 'next/server';
import { getConversationById, getConversationTools, setConversationToolEnabled, getOAuthCredential } from '@/lib/db';
import { tools, toolMetadata, type ToolName } from '@/lib/tools/definitions';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id;
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return Response.json({ error: 'User ID required' }, { status: 400 });
    }

    // Verify conversation exists and belongs to user
    const conversation = getConversationById(conversationId);
    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    if (conversation.user_id !== userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get enabled tools for this conversation
    const conversationTools = getConversationTools(conversationId);
    const enabledToolsMap = new Map(conversationTools.map(t => [t.tool_name, t.enabled]));

    // Check OAuth connections
    const googleConnected = !!getOAuthCredential(userId, 'google');
    const notionConnected = !!getOAuthCredential(userId, 'notion');

    // Build tools list with status
    const toolsList = Object.keys(tools).map((toolName) => {
      const metadata = toolMetadata[toolName as ToolName];
      const enabled = enabledToolsMap.get(toolName) || false;
      
      // Check if auth is available
      let authConnected = true;
      if (metadata.requiresAuth) {
        if (metadata.authProvider === 'google') {
          authConnected = googleConnected;
        } else if (metadata.authProvider === 'notion') {
          authConnected = notionConnected;
        }
      }

      const available = !metadata.requiresAuth || authConnected;

      return {
        toolName,
        displayName: metadata.displayName,
        category: metadata.category,
        description: tools[toolName as ToolName].description,
        enabled,
        available,
        requiresAuth: metadata.requiresAuth,
        authProvider: metadata.authProvider,
        authConnected,
      };
    });

    return Response.json({ tools: toolsList });
  } catch (error) {
    console.error('Error fetching tools:', error);
    return Response.json(
      { error: 'Failed to fetch tools' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id;
    const { userId, toolName, enabled } = await req.json();

    if (!userId) {
      return Response.json({ error: 'User ID required' }, { status: 400 });
    }

    if (!toolName || typeof enabled !== 'boolean') {
      return Response.json({ error: 'Tool name and enabled status required' }, { status: 400 });
    }

    // Verify conversation exists and belongs to user
    const conversation = getConversationById(conversationId);
    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    if (conversation.user_id !== userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Verify tool exists
    if (!(toolName in tools)) {
      return Response.json({ error: 'Invalid tool name' }, { status: 400 });
    }

    // Check if tool requires auth and if user has it
    const metadata = toolMetadata[toolName as ToolName];
    if (metadata.requiresAuth && enabled) {
      const authConnected = !!getOAuthCredential(userId, metadata.authProvider!);
      if (!authConnected) {
        return Response.json(
          { error: `${metadata.authProvider} account not connected. Please connect in Settings.` },
          { status: 400 }
        );
      }
    }

    // Update tool status
    setConversationToolEnabled(conversationId, toolName, enabled);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error updating tool:', error);
    return Response.json(
      { error: 'Failed to update tool' },
      { status: 500 }
    );
  }
}

