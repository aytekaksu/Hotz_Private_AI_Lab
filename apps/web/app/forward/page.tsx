import { redirect } from 'next/navigation';
import { getUserByEmail, createUser, getConversationsByUserId, getMessagesByConversationId, createConversationWithAgent } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Forward() {
  // Resolve or create the default local user
  const email = 'user@assistant.local';
  let user = getUserByEmail(email);
  if (!user) {
    user = createUser(email);
  }

  // Find latest conversation; reuse if empty, else create new
  const list = getConversationsByUserId(user.id);
  let targetId: string | null = null;
  if (Array.isArray(list) && list.length > 0) {
    const latest = list[0];
    const msgs = getMessagesByConversationId(latest.id);
    // Reuse only if empty AND not an agent chat
    const isAgentChat = !!(latest as any).agent_id;
    if ((!msgs || msgs.length === 0) && !isAgentChat) {
      targetId = latest.id;
    }
  }

  if (!targetId) {
    const conv = createConversationWithAgent(user.id, 'New Conversation', null);
    targetId = conv.id;
  }

  redirect(`/chat/${targetId}`);
}
