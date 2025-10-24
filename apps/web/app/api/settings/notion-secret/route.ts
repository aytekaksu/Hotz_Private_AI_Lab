import { NextRequest } from 'next/server';
import {
  deleteOAuthCredential,
  getDecryptedOAuthCredential,
  getUserById,
  storeOAuthCredential,
} from '@/lib/db';

export const runtime = 'nodejs';

const maskSuffix = (secret: string | undefined | null) =>
  secret ? secret.slice(-6) : null;

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

    const credential = getDecryptedOAuthCredential(userId, 'notion');
    const secretSuffix = maskSuffix(credential?.accessToken);

    return Response.json({
      hasSecret: !!credential,
      secretSuffix,
    });
  } catch (error) {
    console.error('Error retrieving Notion secret state:', error);
    return Response.json(
      { error: 'Failed to load Notion integration state' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = (body?.userId || '').trim();
    const secret = (body?.secret || '').trim();

    if (!userId || !secret) {
      return Response.json(
        { error: 'User ID and secret required' },
        { status: 400 }
      );
    }

    const user = getUserById(userId);
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    storeOAuthCredential(userId, 'notion', secret);
    const secretSuffix = maskSuffix(secret);

    return Response.json({
      success: true,
      message: 'Notion integration secret saved',
      secretSuffix,
    });
  } catch (error) {
    console.error('Error saving Notion integration secret:', error);
    return Response.json(
      { error: 'Failed to save Notion integration secret' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = (body?.userId || '').trim();

    if (!userId) {
      return Response.json({ error: 'User ID required' }, { status: 400 });
    }

    const user = getUserById(userId);
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    deleteOAuthCredential(userId, 'notion');

    return Response.json({
      success: true,
      message: 'Notion integration secret removed',
    });
  } catch (error) {
    console.error('Error removing Notion integration secret:', error);
    return Response.json(
      { error: 'Failed to remove Notion integration secret' },
      { status: 500 }
    );
  }
}
