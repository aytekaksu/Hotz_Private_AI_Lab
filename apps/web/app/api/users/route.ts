import { NextRequest } from 'next/server';
import { createUser, getUserByEmail } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    
    if (!email) {
      return Response.json({ error: 'Email required' }, { status: 400 });
    }
    
    // Check if user already exists
    const existingUser = getUserByEmail(email);
    if (existingUser) {
      return Response.json({ user: existingUser });
    }
    
    // Create new user
    const user = createUser(email);
    
    return Response.json({ user });
  } catch (error) {
    console.error('Error creating user:', error);
    return Response.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}


