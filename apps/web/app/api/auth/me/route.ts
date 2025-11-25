import { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { isFirstLoginCompleted, isGoogleOAuthConfigured } from '@/lib/db';
import { route } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (_req: NextRequest) => {
  const user = await getSessionUser();
  
  if (!user) {
    return {
      authenticated: false,
      user: null,
      firstLoginCompleted: isFirstLoginCompleted(),
      googleClientConfigured: await isGoogleOAuthConfigured(),
    };
  }

  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
    },
    firstLoginCompleted: isFirstLoginCompleted(),
    googleClientConfigured: await isGoogleOAuthConfigured(),
  };
});

