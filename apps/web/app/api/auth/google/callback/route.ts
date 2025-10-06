import { NextRequest } from 'next/server';
import { updateUserGoogleTokens } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state'); // userId
    
    if (!code || !state) {
      return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?error=oauth_failed`);
    }
    
    const userId = state;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/google/callback`;
    
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Google token exchange error:', error);
      return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?error=token_exchange_failed`);
    }
    
    const tokens = await tokenResponse.json();
    
    // Save tokens to database (encrypted)
    updateUserGoogleTokens(userId, tokens.access_token, tokens.refresh_token);
    
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?success=google_connected`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?error=oauth_error`);
  }
}


