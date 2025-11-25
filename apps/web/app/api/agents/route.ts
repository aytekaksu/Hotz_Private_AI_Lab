import { createAgent, initializeAgentTools, listAgents, slugifyName, getAgentBySlug } from '@/lib/db';
import { protectedRoute, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = protectedRoute(async (_req, user) => {
  const agents = listAgents(user.id);
  return { agents };
});

export const POST = protectedRoute(async (req, user) => {
  const { name } = await readJson<{ name?: string }>(req);
  if (!name) {
    throw new (await import('@/lib/api')).ApiError(400, 'name required');
  }
  const slug = slugifyName(String(name));
  const exists = getAgentBySlug(user.id, slug);
  if (exists) {
    throw new (await import('@/lib/api')).ApiError(400, 'An agent with this name already exists.');
  }
  const agent = createAgent(user.id, name);
  initializeAgentTools(agent.id);
  return { agent };
});
