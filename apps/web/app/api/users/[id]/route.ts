import { NextRequest } from 'next/server';
import { getUserById } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const userId = params.id;
    
    if (!userId) {
      return Response.json({ error: 'User ID required' }, { status: 400 });
    }
    
    // Only allow fetching the authenticated user's own data
    if (userId !== sessionUser.id) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    
    const user = getUserById(userId);
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    
    return Response.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    return Response.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}
