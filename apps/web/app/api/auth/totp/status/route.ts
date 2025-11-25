import { NextRequest } from 'next/server';
import { route } from '@/lib/api';
import { getSessionFromRequest } from '@/lib/auth';
import { isUserTotpEnabled } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest) => {
  const session = await getSessionFromRequest(req, { allowPendingMfa: true });
  if (!session) {
    return {
      authenticated: false,
      mfaPending: false,
      totpEnabled: false,
      user: null,
    };
  }

  const { user, mfaCompleted } = session;
  const totpEnabled = isUserTotpEnabled(user.id);

  return {
    authenticated: mfaCompleted,
    mfaPending: !mfaCompleted,
    totpEnabled,
    user: {
      id: user.id,
      email: user.email,
    },
  };
});
