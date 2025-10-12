import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import { storeOAuthCredential } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId
  const error = searchParams.get('error');

  if (error) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?error=google_auth_failed`);
  }

  if (!code || !state) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?error=invalid_callback`);
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/auth/google/callback`
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    // Store encrypted credentials
    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;
    storeOAuthCredential(
      state, // userId
      'google',
      tokens.access_token,
      tokens.refresh_token || undefined,
      tokens.scope || undefined,
      expiresAt
    );

    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?success=google_connected`);
  } catch (error) {
    console.error('Error in Google OAuth callback:', error);
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?error=google_token_exchange_failed`);
  }
}
