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
  setAuthSessionMfaCompleted,
  getUserById,
  type User,
} from '@/lib/db';

const SESSION_COOKIE_NAME = 'auth_session';
const MFA_COOKIE_NAME = 'auth_mfa';
const TOKEN_LENGTH = 32; // 256 bits
type SessionOptions = { allowPendingMfa?: boolean };

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
export async function createSession(userId: string, options?: { mfaCompleted?: boolean }): Promise<string> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const mfaCompleted = options?.mfaCompleted === true;
  const session = createAuthSession(userId, tokenHash, mfaCompleted);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
  cookieStore.set(MFA_COOKIE_NAME, mfaCompleted ? 'passed' : 'pending', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  return session.id;
}

async function getSession(
  options?: SessionOptions
): Promise<{ user: User; sessionId: string; mfaCompleted: boolean } | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const tokenHash = await hashToken(token);
    const session = getAuthSessionByTokenHash(tokenHash, { allowPendingMfa: options?.allowPendingMfa });
    if (!session) return null;

    const user = getUserById(session.user_id);
    if (!user) return null;

    const mfaCompleted = session.mfa_completed === 1 || session.mfa_completed === true;
    return { user, sessionId: session.id, mfaCompleted };
  } catch {
    return null;
  }
}

async function getSessionFromRequest(
  req: NextRequest,
  options?: SessionOptions
): Promise<{ user: User; sessionId: string; mfaCompleted: boolean } | null> {
  try {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const tokenHash = await hashToken(token);
    const session = getAuthSessionByTokenHash(tokenHash, { allowPendingMfa: options?.allowPendingMfa });
    if (!session) return null;

    const user = getUserById(session.user_id);
    if (!user) return null;

    const mfaCompleted = session.mfa_completed === 1 || session.mfa_completed === true;
    return { user, sessionId: session.id, mfaCompleted };
  } catch {
    return null;
  }
}

/**
 * Get the current session user (requires MFA by default).
 */
export async function getSessionUser(options?: SessionOptions): Promise<User | null> {
  const session = await getSession(options);
  return session?.user ?? null;
}

/**
 * Get the current session user from a NextRequest (requires MFA by default).
 */
export async function getSessionUserFromRequest(req: NextRequest, options?: SessionOptions): Promise<User | null> {
  const session = await getSessionFromRequest(req, options);
  return session?.user ?? null;
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
    cookieStore.delete(MFA_COOKIE_NAME);
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

export async function markSessionMfaCompleted(sessionId: string): Promise<void> {
  try {
    setAuthSessionMfaCompleted(sessionId);
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      cookieStore.set(MFA_COOKIE_NAME, 'passed', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
    }
  } catch (error) {
    console.error('Failed to mark session MFA complete:', error);
  }
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

export { getSession, getSessionFromRequest };
