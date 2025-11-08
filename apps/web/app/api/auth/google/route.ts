import { NextRequest } from 'next/server';
import { createBaseGoogleOAuth2Client } from '@/lib/google-auth';
import { deleteOAuthCredential } from '@/lib/db';
import { ApiError, route, requireString } from '@/lib/api';

export const runtime = 'nodejs';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
];

export const GET = route((req: NextRequest) => {
  const userId = requireString(req.nextUrl.searchParams.get('userId'), 'User ID');
  try {
    const { client } = createBaseGoogleOAuth2Client();
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: userId,
      prompt: 'consent',
    });
    return Response.redirect(authUrl);
  } catch (error) {
    console.error('Google OAuth client configuration missing:', error);
    throw new ApiError(503, 'Google OAuth client is not configured');
  }
});

export const DELETE = route((req: NextRequest) => {
  const userId = requireString(req.nextUrl.searchParams.get('userId'), 'User ID');
  deleteOAuthCredential(userId, 'google');
  return { success: true, message: 'Google account disconnected' };
});
