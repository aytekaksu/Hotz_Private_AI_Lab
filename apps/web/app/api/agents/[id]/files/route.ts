import { NextRequest } from 'next/server';
import { getAgentDefaultAttachments, setAgentDefaultAttachments, getAttachmentsByIds } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const attachments = getAgentDefaultAttachments(params.id);
    return Response.json({ attachments });
  } catch (error) {
    console.error('Failed to fetch agent files:', error);
    return Response.json({ error: 'Failed to fetch agent files' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { attachmentIds } = body || {};
    const ids = Array.isArray(attachmentIds) ? attachmentIds.filter((v) => typeof v === 'string') : [];
    if (!ids.length) {
      setAgentDefaultAttachments(params.id, []);
      return Response.json({ success: true, attachments: [] });
    }
    const existing = getAttachmentsByIds(ids).filter((att) => att.is_library);
    const existingIds = existing.map((att) => att.id);
    setAgentDefaultAttachments(params.id, existingIds);
    return Response.json({ success: true, attachments: existing });
  } catch (error) {
    console.error('Failed to update agent files:', error);
    const message = error instanceof Error ? error.message : 'Failed to update agent files';
    return Response.json({ error: message }, { status: 500 });
  }
}
