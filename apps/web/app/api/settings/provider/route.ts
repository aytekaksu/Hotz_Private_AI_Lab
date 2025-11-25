import { getActiveAIProvider, setActiveAIProvider } from '@/lib/db';
import { ApiError, protectedRoute, requireString, readJson } from '@/lib/api';

export const runtime = 'nodejs';

export const GET = protectedRoute(async (_req, user) => {
  return { provider: getActiveAIProvider(user.id) };
});

export const POST = protectedRoute(async (req, user) => {
  const body = await readJson<{ provider: string }>(req);
  const provider = requireString(body.provider, 'Provider').toLowerCase();
  if (provider !== 'openrouter' && provider !== 'anthropic') {
    throw new ApiError(400, 'Valid provider required');
  }
  setActiveAIProvider(user.id, provider as 'openrouter' | 'anthropic');
  return { success: true };
});
