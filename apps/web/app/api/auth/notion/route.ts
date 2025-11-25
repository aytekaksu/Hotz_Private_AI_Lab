import { deleteOAuthCredential } from '@/lib/db';
import { route, protectedRoute } from '@/lib/api';

export const runtime = 'nodejs';

export const GET = route(async () => {
  return Response.json(
    {
      error: 'Notion OAuth has been disabled. Provide the integration secret from Settings instead.',
    },
    { status: 410 }
  );
});

export const DELETE = protectedRoute(async (_req, user) => {
  deleteOAuthCredential(user.id, 'notion');
  return { success: true, message: 'Notion account disconnected' };
});
