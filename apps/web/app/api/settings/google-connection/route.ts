import { NextRequest } from 'next/server';
import { getDecryptedOAuthCredential, getOAuthCredential, getGoogleOAuthConfigSummary } from '@/lib/db';
import { route, requireUser } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route((req: NextRequest) => {
  const user = requireUser(req.nextUrl.searchParams.get('userId'));
  const summary = getGoogleOAuthConfigSummary();
  const clientIdSuffix = summary.clientId ? summary.clientId.slice(-8) : null;
  const credential = getDecryptedOAuthCredential(user.id, 'google');
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
