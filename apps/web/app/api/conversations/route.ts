import { NextRequest } from 'next/server';
import { getConversationsByUserId, createConversationWithAgent, initializeDefaultTools, initializeToolsFromAgent } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return Response.json({ error: 'User ID required' }, { status: 400 });
    }
    
    const conversations = getConversationsByUserId(userId);
    
    return Response.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return Response.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, agentId } = await req.json();
    if (!userId || typeof userId !== 'string') {
      return Response.json({ error: 'User ID required' }, { status: 400 });
    }

    const conversation = createConversationWithAgent(userId, 'New Conversation', agentId || null);
    if (agentId) {
      try { initializeToolsFromAgent(conversation.id, agentId); } catch {}
    } else {
      initializeDefaultTools(conversation.id);
    }
    return Response.json({ conversation });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return Response.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}
