import { NextRequest } from 'next/server';
import { getDecryptedOAuthCredential, getOAuthCredential, getGoogleOAuthConfigSummary } from '@/lib/db';
import { route, requireUser } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest) => {
  const user = requireUser(req.nextUrl.searchParams.get('userId'));
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
