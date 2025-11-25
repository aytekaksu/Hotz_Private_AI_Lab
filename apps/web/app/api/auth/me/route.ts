import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { isFirstLoginCompleted, isGoogleOAuthConfigured, isUserTotpEnabled } from '@/lib/db';
import { route } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (_req: NextRequest) => {
  const session = await getSession({ allowPendingMfa: true });
  const user = session?.user;
  const mfaCompleted = session?.mfaCompleted === true;
  
  if (!user) {
    return {
      authenticated: false,
      mfaPending: false,
      user: null,
      firstLoginCompleted: isFirstLoginCompleted(),
      googleClientConfigured: await isGoogleOAuthConfigured(),
      totpEnabled: false,
    };
  }

  return {
    authenticated: !!mfaCompleted,
    mfaPending: !mfaCompleted,
    user: {
      id: user.id,
      email: user.email,
    },
    firstLoginCompleted: isFirstLoginCompleted(),
    googleClientConfigured: await isGoogleOAuthConfigured(),
    totpEnabled: isUserTotpEnabled(user.id),
  };
});
