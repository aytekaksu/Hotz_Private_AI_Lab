import { redirect } from 'next/navigation';
import { getUserByEmail, createUser, getConversationsByUserId, getMessagesByConversationId, createConversationWithAgent } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Forward() {
  try {
    // Resolve or create the default local user so Back to home always leads to a chat
    const email = 'user@assistant.local';
    let user = getUserByEmail(email);
    if (!user) {
      try {
        user = createUser(email);
      } catch {
        // As a last resort, send to settings
        return redirect('/settings');
      }
    }

    // Find latest conversation; reuse if empty non-agent, else create new
    const list = getConversationsByUserId(user.id);
    let targetId: string | null = null;
    if (Array.isArray(list) && list.length > 0) {
      const latest = list[0];
      try {
        const msgs = getMessagesByConversationId(latest.id);
        const isAgentChat = !!(latest as any).agent_id;
        if ((!msgs || msgs.length === 0) && !isAgentChat) {
          targetId = latest.id;
        }
      } catch {}
    }

    if (!targetId) {
      try {
        const conv = createConversationWithAgent(user.id, 'New Conversation', null);
        targetId = conv.id;
      } catch (e) {
        // If creation fails (e.g., disk full), fall back to latest existing conversation if any
        if (Array.isArray(list) && list.length > 0) {
          const latest = list[0];
          targetId = latest.id;
        } else {
          return redirect('/settings');
        }
      }
    }

    return redirect(`/chat/${targetId}`);
  } catch (e) {
    // Last-resort fallback to settings page
    return redirect('/settings');
  }
}
