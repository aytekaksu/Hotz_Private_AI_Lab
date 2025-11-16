import { google } from 'googleapis';
import {
  getDecryptedOAuthCredential,
  storeOAuthCredential,
  getGoogleOAuthConfig,
  GoogleOAuthConfig,
} from './db';

type TokenPayload = {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
};

const readEnvConfig = (): GoogleOAuthConfig | null => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const redirectUris = process.env.GOOGLE_REDIRECT_URIS
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return {
    clientId,
    clientSecret,
    projectId: process.env.GOOGLE_PROJECT_ID ?? null,
    authUri: process.env.GOOGLE_AUTH_URI ?? null,
    tokenUri: process.env.GOOGLE_TOKEN_URI ?? null,
    redirectUris,
  };
};

const resolveGoogleOAuthConfig = async (): Promise<GoogleOAuthConfig | null> =>
  (await getGoogleOAuthConfig()) ?? readEnvConfig();

const normalizeBaseUrl = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

const resolveRedirectBase = (override?: string): string => {
  const candidate =
    normalizeBaseUrl(override) ||
    normalizeBaseUrl(process.env.APP_PUBLIC_URL) ||
    normalizeBaseUrl(process.env.NEXTAUTH_URL);
  if (!candidate) {
    throw new Error('APP_PUBLIC_URL or NEXTAUTH_URL must be configured for Google OAuth redirect handling.');
  }
  return candidate;
};

const persistTokens = async (
  userId: string,
  tokens: TokenPayload,
  fallback: { refreshToken?: string; scope?: string; accountEmail?: string | null }
) => {
  if (!tokens.access_token) {
    return false;
  }
  const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;
  await storeOAuthCredential(
    userId,
    'google',
    tokens.access_token,
    tokens.refresh_token || fallback.refreshToken,
    tokens.scope || fallback.scope,
    expiresAt,
    fallback.accountEmail ?? null
  );
  return true;
};

export const resolveGoogleOAuthConfigStrict = async (): Promise<GoogleOAuthConfig> => {
  const config = await resolveGoogleOAuthConfig();
  if (!config) {
    throw new Error('Google OAuth client not configured. Upload credentials in Settings.');
  }
  return config;
};

export async function createBaseGoogleOAuth2Client(options?: { redirectBase?: string }) {
  const config = await resolveGoogleOAuthConfigStrict();
  const redirectUri = `${resolveRedirectBase(options?.redirectBase)}/api/auth/google/callback`;
  const client = new google.auth.OAuth2(config.clientId, config.clientSecret, redirectUri);
  return { client, config, redirectUri };
}

export async function getGoogleOAuth2Client(userId: string) {
  const credentials = await getDecryptedOAuthCredential(userId, 'google');
  if (!credentials) {
    throw new Error('Google account not connected. Please connect in Settings.');
  }

  const { client } = await createBaseGoogleOAuth2Client();
  client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
    scope: credentials.scope,
    expiry_date: credentials.expiresAt?.getTime(),
  });

  const fallback = {
    refreshToken: credentials.refreshToken,
    scope: credentials.scope,
    accountEmail: credentials.accountEmail ?? null,
  };

  client.on('tokens', (tokens) => {
    console.log('Google tokens refreshed for user:', userId);
    void (async () => {
      if (await persistTokens(userId, tokens, fallback)) {
        if (tokens.refresh_token) {
          fallback.refreshToken = tokens.refresh_token;
        }
        if (tokens.scope) {
          fallback.scope = tokens.scope;
        }
      }
    })();
  });

  return client;
}

export const isGoogleConnected = async (userId: string): Promise<boolean> => {
  try {
    return !!(await getDecryptedOAuthCredential(userId, 'google'))?.accessToken;
  } catch {
    return false;
  }
};

export async function refreshGoogleTokens(userId: string): Promise<boolean> {
  try {
    const oauth2Client = await getGoogleOAuth2Client(userId);
    const existing = await getDecryptedOAuthCredential(userId, 'google');
    if (!existing) return false;
    const { credentials } = await oauth2Client.refreshAccessToken();
    return persistTokens(userId, credentials, existing);
  } catch (error) {
    console.error('Error refreshing Google tokens:', error);
    return false;
  }
}
