import { protectedRoute } from '@/lib/api';

export const runtime = 'nodejs';

// User creation is now handled through Google OAuth login flow only.
// This route is kept for backwards compatibility but now requires authentication
// and only returns the current session user.
export const POST = protectedRoute(async (_req, user) => {
  // Return the authenticated user from the session
  return { user };
});

