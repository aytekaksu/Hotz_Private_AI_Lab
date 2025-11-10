import { NextRequest } from 'next/server';
import { getUserModelDefaults, updateUserModelDefaults } from '@/lib/db';
import { route, requireUser, requireString, readJson } from '@/lib/api';

export const runtime = 'nodejs';

const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
const DEFAULT_VARIANT = 'floor';

export const GET = route((req: NextRequest) => {
  const user = requireUser(req.nextUrl.searchParams.get('userId'));
  const defaults = getUserModelDefaults(user.id);
  return {
    model: defaults.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    routingVariant: defaults.routingVariant || process.env.OPENROUTER_ROUTING_VARIANT || DEFAULT_VARIANT,
  };
});

export const POST = route(async (req: NextRequest) => {
  const body = await readJson<{ userId: string; model: string; routingVariant?: string }>(req);
  const user = requireUser(body.userId);
  const model = requireString(body.model, 'Model');
  const routingVariant =
    typeof body.routingVariant === 'string' && body.routingVariant.trim().length > 0
      ? body.routingVariant.trim()
      : null;
  updateUserModelDefaults(user.id, model, routingVariant);
  return { success: true };
});
