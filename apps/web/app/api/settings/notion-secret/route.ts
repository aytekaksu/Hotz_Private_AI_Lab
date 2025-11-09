import { NextRequest } from 'next/server';
import { deleteOAuthCredential, getDecryptedOAuthCredential, storeOAuthCredential } from '@/lib/db';
import { route, requireUser, requireString, readJson, suffix } from '@/lib/api';

export const runtime = 'nodejs';

const secretSuffix = (value: string | null | undefined) => suffix(value, 6);

export const GET = route(async (req: NextRequest) => {
  const user = requireUser(req.nextUrl.searchParams.get('userId'));
  const credential = await getDecryptedOAuthCredential(user.id, 'notion');
  return {
    hasSecret: !!credential,
    secretSuffix: secretSuffix(credential?.accessToken ?? null),
  };
});

export const POST = route(async (req: NextRequest) => {
  const body = await readJson<{ userId: string; secret: string }>(req);
  const user = requireUser(body.userId);
  const secret = requireString(body.secret, 'Secret');
  await storeOAuthCredential(user.id, 'notion', secret);
  return {
    success: true,
    message: 'Notion integration secret saved',
    secretSuffix: secretSuffix(secret),
  };
});

export const DELETE = route(async (req: NextRequest) => {
  const body = await readJson<{ userId: string }>(req);
  const user = requireUser(body.userId);
  deleteOAuthCredential(user.id, 'notion');
  return {
    success: true,
    message: 'Notion integration secret removed',
  };
});
