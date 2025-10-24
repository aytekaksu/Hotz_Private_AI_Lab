import { NextRequest } from 'next/server';
import { getDecryptedOAuthCredential, getOAuthCredential, getUserById } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const credential = getDecryptedOAuthCredential(userId, 'google');
    if (credential) {
      return Response.json({ connected: true, email: credential.accountEmail ?? null });
    }

    const fallback = getOAuthCredential(userId, 'google');
    return Response.json({ connected: !!fallback, email: null });
  } catch (error) {
    console.error('Failed to load Google connection state:', error);
    return Response.json({ error: 'Failed to resolve Google connection state' }, { status: 500 });
  }
}
