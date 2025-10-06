import { NextRequest } from 'next/server';
import { getConversationsByUserId } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    
    if (!userId) {
      return Response.json({ error: 'User ID required' }, { status: 401 });
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


