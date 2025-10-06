import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  
  if (!userId) {
    return Response.json({ error: 'User ID required' }, { status: 400 });
  }
  
  const clientId = process.env.NOTION_CLIENT_ID;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/notion/callback`;
  
  if (!clientId) {
    return Response.json({ error: 'Notion OAuth not configured' }, { status: 500 });
  }
  
  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');
  authUrl.searchParams.set('state', userId);
  
  return Response.redirect(authUrl.toString());
}


