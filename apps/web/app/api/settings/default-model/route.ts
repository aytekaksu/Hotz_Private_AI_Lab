import { NextRequest } from 'next/server';
import { getUserById, getUserModelDefaults, updateUserModelDefaults } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return Response.json({ error: 'User ID required' }, { status: 400 });
    }

    const user = getUserById(userId);
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const { model, routingVariant } = getUserModelDefaults(userId);

    return Response.json({
      model: model || process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
      routingVariant: (routingVariant || process.env.OPENROUTER_ROUTING_VARIANT || 'floor'),
    });
  } catch (error) {
    console.error('Error loading default model:', error);
    return Response.json({ error: 'Failed to load default model' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, model, routingVariant } = await req.json();

    if (!userId || typeof model !== 'string') {
      return Response.json({ error: 'User ID and model required' }, { status: 400 });
    }

    const user = getUserById(userId);
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const variant = typeof routingVariant === 'string' ? routingVariant : null;
    updateUserModelDefaults(userId, model, variant);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error saving default model:', error);
    return Response.json({ error: 'Failed to save default model' }, { status: 500 });
  }
}

