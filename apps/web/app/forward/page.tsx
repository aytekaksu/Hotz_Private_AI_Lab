import { redirect } from 'next/navigation';
import { getConversationsByUserId, getMessagesByConversationId, createConversationWithAgent } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Forward() {
  try {
    // Get the authenticated user from session
    const user = await getSessionUser();
    if (!user) {
      // Not authenticated - redirect to login
      return redirect('/login');
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
      } catch (e) {
        console.error('[forward] getMessagesByConversationId failed:', e);
      }
    }

    if (!targetId) {
      try {
        const conv = createConversationWithAgent(user.id, 'New Conversation', null);
        targetId = conv.id;
      } catch (e) {
        console.error('[forward] createConversationWithAgent failed:', e);
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
  } catch (e: any) {
    // Allow Next.js redirect exceptions to bubble (they carry a NEXT_REDIRECT digest)
    if (e && typeof e === 'object' && 'digest' in e && typeof (e as any).digest === 'string' && (e as any).digest.startsWith('NEXT_REDIRECT')) {
      throw e;
    }
    console.error('[forward] unhandled error:', e);
    // Last-resort fallback to login page
    return redirect('/login');
  }
}
