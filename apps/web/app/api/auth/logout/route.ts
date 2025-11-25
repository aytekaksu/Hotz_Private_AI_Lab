import { NextRequest } from 'next/server';
import { destroySession } from '@/lib/auth/session';
import { route } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (_req: NextRequest) => {
  await destroySession();
  return { success: true, message: 'Logged out successfully' };
});

export const GET = route(async (req: NextRequest) => {
  await destroySession();
  const baseUrl = process.env.APP_PUBLIC_URL || process.env.NEXTAUTH_URL || req.nextUrl.origin;
  return Response.redirect(`${baseUrl}/login`);
});

