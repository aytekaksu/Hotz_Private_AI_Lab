import { protectedRoute } from '@/lib/api';

export const runtime = 'nodejs';

// This route is deprecated in single-user mode.
// In single-user mode, there's only one user so copying API keys between users is not applicable.
export const POST = protectedRoute(async () => {
  return { error: 'This operation is not supported in single-user mode' };
});
