import { NextRequest } from 'next/server';
import { route, ApiError } from '@/lib/api';
import { getSessionFromRequest } from '@/lib/auth';
import { buildOtpAuthUrl, buildQrCodeDataUrl, generateTotpSecret } from '@/lib/auth/totp';
import { getUserTotpSecret, isUserTotpEnabled, setUserTotpSecret } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req: NextRequest) => {
  const session = await getSessionFromRequest(req, { allowPendingMfa: true });
  if (!session) {
    throw new ApiError(401, 'Authentication required');
  }

  const { user } = session;

  if (isUserTotpEnabled(user.id)) {
    throw new ApiError(409, 'Two-factor authentication is already enabled.');
  }

  let secret = await getUserTotpSecret(user.id);
  if (!secret) {
    secret = generateTotpSecret();
    await setUserTotpSecret(user.id, secret);
  }

  const issuer = process.env.APP_NAME?.trim() || 'AI Assistant';
  const label = user.email;
  const otpauthUrl = buildOtpAuthUrl(secret, label, issuer);
  const qrDataUrl = await buildQrCodeDataUrl(otpauthUrl);

  return {
    secret,
    issuer,
    label,
    otpauthUrl,
    qrDataUrl,
  };
});
