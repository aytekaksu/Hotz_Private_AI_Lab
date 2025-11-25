import { getDecryptedOAuthCredential, getOAuthCredential, getGoogleOAuthConfigSummary } from '@/lib/db';
import { protectedRoute } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = protectedRoute(async (_req, user) => {
  const summary = await getGoogleOAuthConfigSummary();
  const clientIdSuffix = summary.clientId ? summary.clientId.slice(-8) : null;
  const credential = await getDecryptedOAuthCredential(user.id, 'google');
  if (credential) {
    return {
      connected: true,
      email: credential.accountEmail ?? null,
      clientConfigured: summary.configured,
      configSource: summary.source,
      clientIdSuffix,
    };
  }
  const fallback = getOAuthCredential(user.id, 'google');
  return {
    connected: !!fallback,
    email: null,
    clientConfigured: summary.configured,
    configSource: summary.source,
    clientIdSuffix,
  };
});
