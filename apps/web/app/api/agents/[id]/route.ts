import { NextRequest } from 'next/server';
import { getAgentById, updateAgent, deleteAgent, getAttachmentById } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const agent = getAgentById(params.id);
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 });
    
    // Verify the agent belongs to the authenticated user
    if (agent.user_id !== sessionUser.id) {
      return Response.json({ error: 'Agent not found' }, { status: 404 });
    }
    
    return Response.json({ agent });
  } catch (error) {
    console.error('Error fetching agent:', error);
    return Response.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Verify the agent belongs to the authenticated user
    const existingAgent = getAgentById(params.id);
    if (!existingAgent || existingAgent.user_id !== sessionUser.id) {
      return Response.json({ error: 'Agent not found' }, { status: 404 });
    }
    
    const body = await req.json();
    const { name, slug, extraSystemPrompt, overrideSystemPrompt, instructionsAttachmentId, instructionsAttachmentName } = body || {};
    if (instructionsAttachmentId) {
      const attachment = getAttachmentById(instructionsAttachmentId);
      if (attachment?.is_encrypted) {
        return Response.json({ error: 'Encrypted files cannot be used for agent instructions' }, { status: 400 });
      }
    }
    const updated = updateAgent(params.id, {
      name,
      slug,
      extra_system_prompt: extraSystemPrompt,
      override_system_prompt: overrideSystemPrompt,
      instructions_attachment_id: instructionsAttachmentId ?? null,
      instructions_attachment_name: instructionsAttachmentName ?? null,
    });
    if (!updated) return Response.json({ error: 'Agent not found' }, { status: 404 });
    return Response.json({ agent: updated });
  } catch (error) {
    console.error('Error updating agent:', error);
    return Response.json({ error: 'Failed to update agent' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Verify the agent belongs to the authenticated user
    const existingAgent = getAgentById(params.id);
    if (!existingAgent || existingAgent.user_id !== sessionUser.id) {
      return Response.json({ error: 'Agent not found' }, { status: 404 });
    }
    
    deleteAgent(params.id);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent:', error);
    return Response.json({ error: 'Failed to delete agent' }, { status: 500 });
  }
}
