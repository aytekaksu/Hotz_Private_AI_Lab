import { NextRequest } from 'next/server';
import { storeOAuthCredential } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId
  const error = searchParams.get('error');

  if (error) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?error=notion_auth_failed`);
  }

  if (!code || !state) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?error=invalid_callback`);
  }

  try {
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/notion/callback`;
    
    // Exchange code for access token
    const auth = Buffer.from(
      `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
    ).toString('base64');

    const response = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Notion token exchange error:', errorData);
      throw new Error('Token exchange failed');
    }

    const data = await response.json();

    if (!data.access_token) {
      throw new Error('No access token received');
    }

    // Store encrypted credentials (Notion tokens don't expire or have refresh tokens)
    storeOAuthCredential(
      state, // userId
      'notion',
      data.access_token,
      undefined, // No refresh token
      undefined, // No scope
      undefined  // No expiry
    );

    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?success=notion_connected`);
  } catch (error) {
    console.error('Error in Notion OAuth callback:', error);
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?error=notion_token_exchange_failed`);
  }
}
