import { NextRequest } from 'next/server';
import { getConversationById, getMessagesByConversationId, deleteConversation } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id;
    
    const conversation = getConversationById(conversationId);
    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    const messages = getMessagesByConversationId(conversationId);
    
    return Response.json({
      conversation,
      messages,
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return Response.json(
      { error: 'Failed to fetch conversation' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id;
    
    deleteConversation(conversationId);
    
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return Response.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    );
  }
}


