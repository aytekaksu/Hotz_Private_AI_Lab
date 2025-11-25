import { getActiveAIProvider, setActiveAIProvider, getUserOpenRouterKey, getUserAnthropicKey } from '@/lib/db';
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

  if (provider === 'openrouter') {
    const userKey = await getUserOpenRouterKey(user.id);
    const envKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!userKey && !envKey) {
      throw new ApiError(400, 'Add an OpenRouter API key before selecting this provider.');
    }
  }

  if (provider === 'anthropic') {
    const userKey = await getUserAnthropicKey(user.id);
    const envKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!userKey && !envKey) {
      throw new ApiError(400, 'Add an Anthropic API key before selecting this provider.');
    }
  }

  setActiveAIProvider(user.id, provider as 'openrouter' | 'anthropic');
  return { success: true };
});
