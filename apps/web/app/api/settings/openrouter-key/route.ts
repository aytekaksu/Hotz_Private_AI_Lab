import { NextRequest } from 'next/server';
import { getUserById, getUserOpenRouterKey, updateUserOpenRouterKey } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return Response.json({ error: 'User ID required' }, { status: 400 });
    }
    
    const user = getUserById(userId);
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    
    const decrypted = getUserOpenRouterKey(userId);
    const keySuffix = decrypted ? decrypted.slice(-10) : null;

    return Response.json({ 
      hasKey: !!user.openrouter_api_key,
      keySuffix,
    });
  } catch (error) {
    console.error('Error checking OpenRouter key:', error);
    return Response.json(
      { error: 'Failed to check API key' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, apiKey } = await req.json();
    
    if (!userId || !apiKey) {
      return Response.json({ error: 'User ID and API key required' }, { status: 400 });
    }
    
    const user = getUserById(userId);
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    
    updateUserOpenRouterKey(userId, apiKey);
    const suffix = apiKey.slice(-10);
    
    return Response.json({ 
      success: true,
      message: 'API key saved successfully',
      keySuffix: suffix,
    });
  } catch (error) {
    console.error('Error saving OpenRouter key:', error);
    return Response.json(
      { error: 'Failed to save API key' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await req.json();
    
    if (!userId) {
      return Response.json({ error: 'User ID required' }, { status: 400 });
    }
    
    const user = getUserById(userId);
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    
    updateUserOpenRouterKey(userId, '');
    
    return Response.json({ 
      success: true,
      message: 'API key removed successfully'
    });
  } catch (error) {
    console.error('Error removing OpenRouter key:', error);
    return Response.json(
      { error: 'Failed to remove API key' },
      { status: 500 }
    );
  }
}
