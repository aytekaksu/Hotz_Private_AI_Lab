import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import { storeOAuthCredential } from '@/lib/db';
import { createBaseGoogleOAuth2Client } from '@/lib/google-auth';

export const runtime = 'nodejs';

const baseUrl = (process.env.NEXTAUTH_URL || process.env.APP_PUBLIC_URL || 'http://localhost:3000').trim();
const SETTINGS_URL = `${baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl}/settings`;
const redirect = (query: string) => Response.redirect(`${SETTINGS_URL}?${query}`);

const loadOAuthClient = async () => {
  try {
    return (await createBaseGoogleOAuth2Client()).client;
  } catch (error) {
    console.error('Google OAuth client configuration missing:', error);
    throw new Error('GOOGLE_CLIENT_NOT_CONFIGURED');
  }
};

const fetchAccountEmail = async (oauth2Client: any) => {
  try {
    const oauth2 = google.oauth2('v2');
    const userinfo = await oauth2.userinfo.get({ auth: oauth2Client });
    return typeof userinfo.data?.email === 'string' ? userinfo.data.email : null;
  } catch (profileError) {
    console.warn('Failed to fetch Google profile email:', profileError);
    return null;
  }
};

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get('error')) {
    return redirect('error=google_auth_failed');
  }

  const code = params.get('code');
  const userId = params.get('state');
  if (!code || !userId) {
    return redirect('error=invalid_callback');
  }

  try {
    const oauth2Client = await loadOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    const accountEmail = await fetchAccountEmail(oauth2Client);
    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;

    await storeOAuthCredential(
      userId,
      'google',
      tokens.access_token,
      tokens.refresh_token || undefined,
      tokens.scope || undefined,
      expiresAt,
      accountEmail
    );

    return redirect('success=google_connected');
  } catch (error) {
    const code =
      error instanceof Error && error.message === 'GOOGLE_CLIENT_NOT_CONFIGURED'
        ? 'error=google_client_not_configured'
        : 'error=google_token_exchange_failed';
    console.error('Error in Google OAuth callback:', error);
    return redirect(code);
  }
}
