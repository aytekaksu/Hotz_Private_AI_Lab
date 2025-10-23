import { NextRequest } from 'next/server';
import { getUserById, getActiveAIProvider, setActiveAIProvider } from '@/lib/db';

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

    const provider = getActiveAIProvider(userId);
    return Response.json({ provider });
  } catch (error) {
    console.error('Error loading provider:', error);
    return Response.json({ error: 'Failed to load provider' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, provider } = await req.json();
    if (!userId || (provider !== 'openrouter' && provider !== 'anthropic')) {
      return Response.json({ error: 'User ID and valid provider required' }, { status: 400 });
    }
    const user = getUserById(userId);
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    setActiveAIProvider(userId, provider);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error saving provider:', error);
    return Response.json({ error: 'Failed to save provider' }, { status: 500 });
  }
}

