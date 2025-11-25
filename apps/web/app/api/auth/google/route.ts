import { NextRequest } from 'next/server';
import { createBaseGoogleOAuth2Client } from '@/lib/google-auth';
import { deleteOAuthCredential } from '@/lib/db';
import { ApiError, route, protectedRoute } from '@/lib/api';

export const runtime = 'nodejs';

// Scopes for login (profile/email) + calendar/tasks integration
const LOGIN_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
];

/**
 * Initiate Google OAuth flow.
 * - For login: no userId param, state='login'
 * - For reconnect (already logged in): uses session user, state=userId
 */
export const GET = route(async (req: NextRequest) => {
  const mode = req.nextUrl.searchParams.get('mode') || 'login';
  
  try {
    const { client } = await createBaseGoogleOAuth2Client();
    
    // State encodes the mode so callback knows what to do
    const state = mode === 'reconnect' ? 'reconnect' : 'login';
    
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: LOGIN_SCOPES,
      state,
      prompt: 'consent',
    });
    return Response.redirect(authUrl);
  } catch (error) {
    console.error('Google OAuth client configuration missing:', error);
    throw new ApiError(503, 'Google OAuth client is not configured');
  }
});

/**
 * Disconnect Google account (requires authentication).
 */
export const DELETE = protectedRoute(async (_req, user) => {
  deleteOAuthCredential(user.id, 'google');
  return { success: true, message: 'Google account disconnected' };
});
