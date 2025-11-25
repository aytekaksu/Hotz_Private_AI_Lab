import { NextRequest } from 'next/server';
import { ApiError, route } from '@/lib/api';
import { getSessionFromRequest, markSessionMfaCompleted } from '@/lib/auth';
import { getUserTotpSecret, isUserTotpEnabled, markUserTotpEnabled, setFirstLoginCompleted } from '@/lib/db';
import { verifyTotpCode } from '@/lib/auth/totp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const readBody = async (req: NextRequest): Promise<{ code?: string }> => {
  try {
    return await req.json();
  } catch {
    return {};
  }
};

export const POST = route(async (req: NextRequest) => {
  const session = await getSessionFromRequest(req, { allowPendingMfa: true });
  if (!session) {
    throw new ApiError(401, 'Authentication required');
  }

  const { user, sessionId } = session;
  const { code } = await readBody(req);
  const token = typeof code === 'string' ? code.trim() : '';
  if (!token) {
    throw new ApiError(400, 'Verification code is required');
  }

  const secret = await getUserTotpSecret(user.id);
  if (!secret) {
    throw new ApiError(400, 'TOTP is not set up yet');
  }

  const valid = verifyTotpCode(secret, token);
  if (!valid) {
    throw new ApiError(400, 'Invalid or expired code');
  }

  if (!isUserTotpEnabled(user.id)) {
    markUserTotpEnabled(user.id);
  }

  setFirstLoginCompleted();
  await markSessionMfaCompleted(sessionId);

  return { success: true };
});
