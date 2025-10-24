import { NextRequest } from 'next/server';
import { deleteOAuthCredential } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return Response.json(
    {
      error: 'Notion OAuth has been disabled. Provide the integration secret from Settings instead.',
    },
    { status: 410 }
  );
}

export async function DELETE(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const userId = searchParams.get('userId');

  if (!userId) {
    return Response.json({ error: 'User ID required' }, { status: 400 });
  }

  try {
    deleteOAuthCredential(userId, 'notion');
    return Response.json({ success: true, message: 'Notion account disconnected' });
  } catch (error) {
    console.error('Error disconnecting Notion:', error);
    return Response.json({ error: 'Failed to disconnect Notion account' }, { status: 500 });
  }
}
