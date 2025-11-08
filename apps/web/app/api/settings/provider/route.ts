import { NextRequest } from 'next/server';
import { getActiveAIProvider, setActiveAIProvider } from '@/lib/db';
import { ApiError, route, requireUser, requireString, readJson } from '@/lib/api';

export const runtime = 'nodejs';

export const GET = route((req: NextRequest) => {
  const user = requireUser(req.nextUrl.searchParams.get('userId'));
  return { provider: getActiveAIProvider(user.id) };
});

export const POST = route(async (req: NextRequest) => {
  const body = await readJson<{ userId: string; provider: string }>(req);
  const user = requireUser(body.userId);
  const provider = requireString(body.provider, 'Provider').toLowerCase();
  if (provider !== 'openrouter' && provider !== 'anthropic') {
    throw new ApiError(400, 'User ID and valid provider required');
  }
  setActiveAIProvider(user.id, provider as 'openrouter' | 'anthropic');
  return { success: true };
});
