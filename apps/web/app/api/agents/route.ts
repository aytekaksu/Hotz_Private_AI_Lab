import { NextRequest } from 'next/server';
import { createAgent, initializeAgentTools, listAgents, slugifyName } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) return Response.json({ error: 'User ID required' }, { status: 400 });
    const agents = listAgents(userId);
    return Response.json({ agents });
  } catch (error) {
    console.error('Error listing agents:', error);
    return Response.json({ error: 'Failed to list agents' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, name } = body || {};
    if (!userId || !name) return Response.json({ error: 'userId and name required' }, { status: 400 });
    const agent = createAgent(userId, name);
    initializeAgentTools(agent.id);
    return Response.json({ agent });
  } catch (error) {
    console.error('Error creating agent:', error);
    return Response.json({ error: 'Failed to create agent' }, { status: 500 });
  }
}

