import { getConversationsByUserId, createConversationWithAgent, initializeDefaultTools, initializeToolsFromAgent } from '@/lib/db';
import { protectedRoute, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = protectedRoute(async (_req, user) => {
  const conversations = getConversationsByUserId(user.id);
  return { conversations };
});

export const POST = protectedRoute(async (req, user) => {
  const { agentId } = await readJson<{ agentId?: string }>(req);

  const conversation = createConversationWithAgent(user.id, 'New Conversation', agentId || null);
  if (agentId) {
    try { initializeToolsFromAgent(conversation.id, agentId); } catch {}
  } else {
    initializeDefaultTools(conversation.id);
  }
  return { conversation };
});
