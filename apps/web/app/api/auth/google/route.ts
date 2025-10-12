import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import { deleteOAuthCredential } from '@/lib/db';

export const runtime = 'nodejs';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
];

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const userId = searchParams.get('userId');

  if (!userId) {
    return Response.json({ error: 'User ID required' }, { status: 400 });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/google/callback`
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: userId, // Pass userId in state
    prompt: 'consent', // Force consent to get refresh token
  });

  return Response.redirect(authUrl);
}

export async function DELETE(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const userId = searchParams.get('userId');

  if (!userId) {
    return Response.json({ error: 'User ID required' }, { status: 400 });
  }

  try {
    deleteOAuthCredential(userId, 'google');
    return Response.json({ success: true, message: 'Google account disconnected' });
  } catch (error) {
    console.error('Error disconnecting Google:', error);
    return Response.json({ error: 'Failed to disconnect Google account' }, { status: 500 });
  }
}
