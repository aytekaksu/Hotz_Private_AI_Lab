import { NextRequest } from 'next/server';
import { updateUserOpenRouterKey } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { userId, apiKey } = await req.json();
    
    if (!userId || !apiKey) {
      return Response.json(
        { error: 'User ID and API key required' },
        { status: 400 }
      );
    }
    
    updateUserOpenRouterKey(userId, apiKey);
    
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error saving OpenRouter API key:', error);
    return Response.json(
      { error: 'Failed to save API key' },
      { status: 500 }
    );
  }
}


