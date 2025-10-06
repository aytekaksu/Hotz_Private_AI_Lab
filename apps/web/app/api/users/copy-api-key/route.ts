import { NextRequest } from 'next/server';
import { getUserById, updateUserOpenRouterKey } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { userId, sourceUserId } = await req.json();
    
    if (!userId || !sourceUserId) {
      return Response.json(
        { error: 'User ID and source user ID required' },
        { status: 400 }
      );
    }
    
    // Get source user's API key
    const sourceUser = getUserById(sourceUserId);
    if (!sourceUser || !sourceUser.openrouter_api_key) {
      return Response.json(
        { error: 'Source user not found or has no API key' },
        { status: 404 }
      );
    }
    
    // Copy API key to target user
    updateUserOpenRouterKey(userId, sourceUser.openrouter_api_key);
    
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error copying API key:', error);
    return Response.json(
      { error: 'Failed to copy API key' },
      { status: 500 }
    );
  }
}
