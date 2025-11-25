import { deleteOAuthCredential, getDecryptedOAuthCredential, storeOAuthCredential } from '@/lib/db';
import { protectedRoute, requireString, readJson, suffix } from '@/lib/api';

export const runtime = 'nodejs';

const secretSuffix = (value: string | null | undefined) => suffix(value, 6);

export const GET = protectedRoute(async (_req, user) => {
  const credential = await getDecryptedOAuthCredential(user.id, 'notion');
  return {
    hasSecret: !!credential,
    secretSuffix: secretSuffix(credential?.accessToken ?? null),
  };
});

export const POST = protectedRoute(async (req, user) => {
  const body = await readJson<{ secret: string }>(req);
  const secret = requireString(body.secret, 'Secret');
  await storeOAuthCredential(user.id, 'notion', secret);
  return {
    success: true,
    message: 'Notion integration secret saved',
    secretSuffix: secretSuffix(secret),
  };
});

export const DELETE = protectedRoute(async (_req, user) => {
  deleteOAuthCredential(user.id, 'notion');
  return {
    success: true,
    message: 'Notion integration secret removed',
  };
});
