import { NextRequest } from 'next/server';
import { getConversationById, getMessagesByConversationId, deleteConversation, getAttachmentsByMessageId } from '@/lib/db';

export const runtime = 'nodejs';

const sanitizeAttachment = (att: any) => {
  const { encryption_password_hash, failed_attempts, ...rest } = att || {};
  return rest;
};

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
      messages: messages.map(msg => {
        let parsedParts: any[] | undefined;
        try {
          if (msg.tool_calls) {
            const p = JSON.parse(msg.tool_calls);
            if (Array.isArray(p)) parsedParts = p;
          }
        } catch {}
        const partsOut: any[] = Array.isArray(parsedParts) ? (parsedParts as any[]) : [];
        return {
          role: msg.role,
          content: msg.content,
          parts: partsOut,
          id: msg.id,
          created_at: msg.created_at,
          attachments: getAttachmentsByMessageId(msg.id).map(sanitizeAttachment),
        };
      })
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
    
    return Response.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return Response.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    );
  }
}
