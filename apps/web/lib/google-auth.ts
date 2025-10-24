import { google } from 'googleapis';
import { getDecryptedOAuthCredential, storeOAuthCredential } from './db';

/**
 * Get a Google OAuth2 client with automatic token refresh
 */
export async function getGoogleOAuth2Client(userId: string) {
  const credentials = getDecryptedOAuthCredential(userId, 'google');
  if (!credentials) {
    throw new Error('Google account not connected. Please connect in Settings.');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/google/callback`
  );

  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
    scope: credentials.scope,
    expiry_date: credentials.expiresAt?.getTime(),
  });

  // Set up automatic token refresh handler
  oauth2Client.on('tokens', (tokens) => {
    console.log('Google tokens refreshed for user:', userId);
    
    // Save the new access token (and refresh token if provided)
    if (tokens.access_token) {
      const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;
      
      storeOAuthCredential(
        userId,
        'google',
        tokens.access_token,
        tokens.refresh_token || credentials.refreshToken, // Use new refresh token or keep existing
        tokens.scope || credentials.scope,
        expiresAt,
        credentials.accountEmail ?? null
      );
    }
  });

  return oauth2Client;
}

/**
 * Check if Google OAuth credentials are valid and connected
 */
export function isGoogleConnected(userId: string): boolean {
  try {
    const credentials = getDecryptedOAuthCredential(userId, 'google');
    return !!credentials?.accessToken;
  } catch (error) {
    return false;
  }
}

/**
 * Manually refresh Google OAuth tokens
 */
export async function refreshGoogleTokens(userId: string): Promise<boolean> {
  try {
    const oauth2Client = await getGoogleOAuth2Client(userId);
    const { credentials } = await oauth2Client.refreshAccessToken();
    const existing = getDecryptedOAuthCredential(userId, 'google');
    
    if (credentials.access_token) {
      const expiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : undefined;
      
      storeOAuthCredential(
        userId,
        'google',
        credentials.access_token,
        credentials.refresh_token || undefined,
        credentials.scope || undefined,
        expiresAt,
        existing?.accountEmail ?? null
      );
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error refreshing Google tokens:', error);
    return false;
  }
}
