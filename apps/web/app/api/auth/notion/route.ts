import { NextRequest } from 'next/server';
import { deleteOAuthCredential } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const userId = searchParams.get('userId');

  if (!userId) {
    return Response.json({ error: 'User ID required' }, { status: 400 });
  }

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/notion/callback`;
  
  const authUrl = `https://api.notion.com/v1/oauth/authorize?` +
    `client_id=${process.env.NOTION_CLIENT_ID}` +
    `&response_type=code` +
    `&owner=user` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${userId}`;

  return Response.redirect(authUrl);
}

export async function DELETE(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const userId = searchParams.get('userId');

  if (!userId) {
    return Response.json({ error: 'User ID required' }, { status: 400 });
  }

  try {
    deleteOAuthCredential(userId, 'notion');
    return Response.json({ success: true, message: 'Notion account disconnected' });
  } catch (error) {
    console.error('Error disconnecting Notion:', error);
    return Response.json({ error: 'Failed to disconnect Notion account' }, { status: 500 });
  }
}
