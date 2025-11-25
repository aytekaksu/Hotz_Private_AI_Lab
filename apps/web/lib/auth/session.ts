/**
 * Session management for single-user Google authentication.
 * Uses secure random tokens stored as hashed values in the database.
 */

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import {
  createAuthSession,
  getAuthSessionByTokenHash,
  deleteAuthSession,
  deleteAuthSessionsByUser,
  getUserById,
  type User,
} from '@/lib/db';

const SESSION_COOKIE_NAME = 'auth_session';
const TOKEN_LENGTH = 32; // 256 bits

/**
 * Generate a cryptographically secure random token.
 */
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash a token using SHA-256.
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a new session for a user and set the session cookie.
 * Returns the session ID.
 */
export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const session = createAuthSession(userId, tokenHash);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  return session.id;
}

/**
 * Get the current session from cookies (for Server Components / Route Handlers).
 * Returns the user if session is valid, null otherwise.
 */
export async function getSessionUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const tokenHash = await hashToken(token);
    const session = getAuthSessionByTokenHash(tokenHash);
    if (!session) return null;

    const user = getUserById(session.user_id);
    return user;
  } catch {
    return null;
  }
}

/**
 * Get the current session from a NextRequest (for middleware).
 * Returns the user if session is valid, null otherwise.
 */
export async function getSessionUserFromRequest(req: NextRequest): Promise<User | null> {
  try {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const tokenHash = await hashToken(token);
    const session = getAuthSessionByTokenHash(tokenHash);
    if (!session) return null;

    const user = getUserById(session.user_id);
    return user;
  } catch {
    return null;
  }
}

/**
 * Destroy the current session and clear the cookie.
 */
export async function destroySession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      const tokenHash = await hashToken(token);
      const session = getAuthSessionByTokenHash(tokenHash);
      if (session) {
        deleteAuthSession(session.id);
      }
    }
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Destroy all sessions for a user.
 */
export function destroyAllUserSessions(userId: string): void {
  deleteAuthSessionsByUser(userId);
}

/**
 * Check if there's a valid session (lightweight check).
 */
export async function hasValidSession(): Promise<boolean> {
  const user = await getSessionUser();
  return user !== null;
}

/**
 * Check if there's a valid session from request (for middleware).
 */
export async function hasValidSessionFromRequest(req: NextRequest): Promise<boolean> {
  const user = await getSessionUserFromRequest(req);
  return user !== null;
}

