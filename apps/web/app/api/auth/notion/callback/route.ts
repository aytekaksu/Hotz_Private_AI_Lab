import { NextRequest } from 'next/server';
import { updateUserNotionToken } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state'); // userId
    
    if (!code || !state) {
      return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?error=oauth_failed`);
    }
    
    const userId = state;
    const clientId = process.env.NOTION_CLIENT_ID;
    const clientSecret = process.env.NOTION_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/notion/callback`;
    
    // Exchange code for token
    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Notion token exchange error:', error);
      return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?error=token_exchange_failed`);
    }
    
    const tokens = await tokenResponse.json();
    
    // Save token to database (encrypted)
    updateUserNotionToken(userId, tokens.access_token);
    
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?success=notion_connected`);
  } catch (error) {
    console.error('Notion OAuth callback error:', error);
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?error=oauth_error`);
  }
}


