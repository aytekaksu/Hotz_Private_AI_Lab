import { NextRequest } from 'next/server';
import { getUserById, getUserAnthropicKey, updateUserAnthropicKey } from '@/lib/db';

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

    const decrypted = getUserAnthropicKey(userId);
    const keySuffix = decrypted ? decrypted.slice(-10) : null;

    return Response.json({ hasKey: !!user.anthropic_api_key, keySuffix });
  } catch (error) {
    console.error('Error checking Anthropic key:', error);
    return Response.json({ error: 'Failed to check API key' }, { status: 500 });
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

    updateUserAnthropicKey(userId, apiKey);

    return Response.json({ success: true, keySuffix: apiKey.slice(-10) });
  } catch (error) {
    console.error('Error saving Anthropic key:', error);
    return Response.json({ error: 'Failed to save API key' }, { status: 500 });
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

    updateUserAnthropicKey(userId, '');

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error removing Anthropic key:', error);
    return Response.json({ error: 'Failed to remove API key' }, { status: 500 });
  }
}
