import { NextRequest } from 'next/server';
import { getAgentDefaultAttachments, setAgentDefaultAttachments, getAttachmentsByIds, getAgentById } from '@/lib/db';
import { sanitizeAttachments } from '@/lib/files/sanitize-attachment';
import { getSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Verify the agent belongs to the authenticated user
    const agent = getAgentById(params.id);
    if (!agent || agent.user_id !== sessionUser.id) {
      return Response.json({ error: 'Agent not found' }, { status: 404 });
    }
    
    const attachments = sanitizeAttachments(getAgentDefaultAttachments(params.id));
    return Response.json({ attachments });
  } catch (error) {
    console.error('Failed to fetch agent files:', error);
    return Response.json({ error: 'Failed to fetch agent files' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Verify the agent belongs to the authenticated user
    const agent = getAgentById(params.id);
    if (!agent || agent.user_id !== sessionUser.id) {
      return Response.json({ error: 'Agent not found' }, { status: 404 });
    }
    
    const body = await req.json();
    const { attachmentIds } = body || {};
    const ids = Array.isArray(attachmentIds) ? attachmentIds.filter((v) => typeof v === 'string') : [];
    if (!ids.length) {
      setAgentDefaultAttachments(params.id, []);
      return Response.json({ success: true, attachments: [] });
    }
    const existing = getAttachmentsByIds(ids).filter((att) => att.is_library);
    const encrypted = existing.find((att) => att.is_encrypted);
    if (encrypted) {
      return Response.json(
        { error: 'Encrypted files cannot be enabled as default files for agents.' },
        { status: 400 },
      );
    }
    const existingIds = existing.map((att) => att.id);
    setAgentDefaultAttachments(params.id, existingIds);
    return Response.json({ success: true, attachments: sanitizeAttachments(existing) });
  } catch (error) {
    console.error('Failed to update agent files:', error);
    const message = error instanceof Error ? error.message : 'Failed to update agent files';
    return Response.json({ error: message }, { status: 500 });
  }
}
