import { NextRequest } from 'next/server';
import { getUserOpenRouterKey, updateUserOpenRouterKey } from '@/lib/db';
import { route, requireUser, requireString, readJson, suffix } from '@/lib/api';

export const runtime = 'nodejs';

export const GET = route((req: NextRequest) => {
  const user = requireUser(req.nextUrl.searchParams.get('userId'));
  return {
    hasKey: !!user.openrouter_api_key,
    keySuffix: suffix(getUserOpenRouterKey(user.id)),
  };
});

export const POST = route(async (req: NextRequest) => {
  const body = await readJson<{ userId: string; apiKey: string }>(req);
  const user = requireUser(body.userId);
  const apiKey = requireString(body.apiKey, 'API key');
  updateUserOpenRouterKey(user.id, apiKey);
  return {
    success: true,
    message: 'API key saved successfully',
    keySuffix: suffix(apiKey),
  };
});

export const DELETE = route(async (req: NextRequest) => {
  const body = await readJson<{ userId: string }>(req);
  const user = requireUser(body.userId);
  updateUserOpenRouterKey(user.id, '');
  return {
    success: true,
    message: 'API key removed successfully',
  };
});
