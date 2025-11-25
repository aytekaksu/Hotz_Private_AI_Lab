import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import {
  storeOAuthCredential,
  getUserByEmail,
  createUser,
  setFirstLoginCompleted,
} from '@/lib/db';
import { createBaseGoogleOAuth2Client } from '@/lib/google-auth';
import { isEmailAuthorized } from '@/lib/auth/config';
import { createSession, getSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

const resolveBaseUrl = (req: NextRequest): string => {
  const candidates = [
    process.env.APP_PUBLIC_URL,
    process.env.NEXTAUTH_URL,
    req.nextUrl.origin,
    'http://localhost:3000',
  ];
  for (const raw of candidates) {
    const trimmed = raw?.trim();
    if (trimmed) {
      return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
    }
  }
  return 'http://localhost:3000';
};

const loadOAuthClient = async (redirectBase?: string) => {
  try {
    return (await createBaseGoogleOAuth2Client({ redirectBase })).client;
  } catch (error) {
    console.error('Google OAuth client configuration missing:', error);
    throw new Error('GOOGLE_CLIENT_NOT_CONFIGURED');
  }
};

const fetchAccountEmail = async (oauth2Client: any): Promise<string | null> => {
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
  const baseUrl = resolveBaseUrl(req);
  const loginUrl = `${baseUrl}/login`;
  const homeUrl = `${baseUrl}/`;
  const settingsUrl = `${baseUrl}/settings`;
  
  const redirectToLogin = (query: string) => Response.redirect(`${loginUrl}?${query}`);
  const redirectToSettings = (query: string) => Response.redirect(`${settingsUrl}?${query}`);
  
  const params = req.nextUrl.searchParams;
  const state = params.get('state') || 'login';
  const isLoginFlow = state === 'login';
  const isReconnectFlow = state === 'reconnect';
  
  // Handle OAuth errors
  if (params.get('error')) {
    if (isLoginFlow) {
      return redirectToLogin('error=google_auth_failed');
    }
    return redirectToSettings('error=google_auth_failed');
  }

  const code = params.get('code');
  if (!code) {
    if (isLoginFlow) {
      return redirectToLogin('error=invalid_callback');
    }
    return redirectToSettings('error=invalid_callback');
  }

  try {
    const oauth2Client = await loadOAuthClient(baseUrl);
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    const accountEmail = await fetchAccountEmail(oauth2Client);
    if (!accountEmail) {
      console.error('Could not retrieve email from Google account');
      if (isLoginFlow) {
        return redirectToLogin('error=email_not_available');
      }
      return redirectToSettings('error=email_not_available');
    }

    // For login flow: verify email is authorized
    if (isLoginFlow) {
      if (!isEmailAuthorized(accountEmail)) {
        console.warn(`Unauthorized login attempt from: ${accountEmail}`);
        return redirectToLogin('error=unauthorized_email');
      }

      // Get or create the user
      let user = getUserByEmail(accountEmail);
      if (!user) {
        user = createUser(accountEmail);
      }

      // Store OAuth credentials for calendar/tasks integration
      const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;
      await storeOAuthCredential(
        user.id,
        'google',
        tokens.access_token,
        tokens.refresh_token || undefined,
        tokens.scope || undefined,
        expiresAt,
        accountEmail
      );

      // Mark first login as completed
      setFirstLoginCompleted();

      // Create session
      await createSession(user.id);

      // Redirect to home
      return Response.redirect(homeUrl);
    }

    // For reconnect flow: must be already logged in
    if (isReconnectFlow) {
      const sessionUser = await getSessionUser();
      if (!sessionUser) {
        return redirectToLogin('error=session_expired');
      }

      // Verify the reconnected account matches the session user's email
      if (accountEmail.toLowerCase() !== sessionUser.email.toLowerCase()) {
        return redirectToSettings('error=email_mismatch');
      }

      const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;
      await storeOAuthCredential(
        sessionUser.id,
        'google',
        tokens.access_token,
        tokens.refresh_token || undefined,
        tokens.scope || undefined,
        expiresAt,
        accountEmail
      );

      return redirectToSettings('success=google_connected');
    }

    // Unknown state - redirect to login
    return redirectToLogin('error=invalid_state');
  } catch (error) {
    const errorCode =
      error instanceof Error && error.message === 'GOOGLE_CLIENT_NOT_CONFIGURED'
        ? 'error=google_client_not_configured'
        : 'error=google_token_exchange_failed';
    console.error('Error in Google OAuth callback:', error);
    if (isLoginFlow) {
      return redirectToLogin(errorCode);
    }
    return redirectToSettings(errorCode);
  }
}
