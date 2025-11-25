import { getUserModelDefaults, updateUserModelDefaults } from '@/lib/db';
import { protectedRoute, requireString, readJson } from '@/lib/api';

export const runtime = 'nodejs';

const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
const DEFAULT_VARIANT = 'floor';

export const GET = protectedRoute(async (_req, user) => {
  const defaults = getUserModelDefaults(user.id);
  return {
    model: defaults.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    routingVariant: defaults.routingVariant || process.env.OPENROUTER_ROUTING_VARIANT || DEFAULT_VARIANT,
  };
});

export const POST = protectedRoute(async (req, user) => {
  const body = await readJson<{ model: string; routingVariant?: string }>(req);
  const model = requireString(body.model, 'Model');
  const routingVariant =
    typeof body.routingVariant === 'string' && body.routingVariant.trim().length > 0
      ? body.routingVariant.trim()
      : null;
  updateUserModelDefaults(user.id, model, routingVariant);
  return { success: true };
});
