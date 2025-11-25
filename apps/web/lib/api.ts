import type { NextRequest } from 'next/server';
import { getUserById, type User } from './db';
import { getSessionUser } from './auth';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (payload: any, status = 200) => Response.json(payload, { status });

export const route =
  <T>(handler: (req: NextRequest) => Promise<T | Response> | T | Response) =>
  async (req: NextRequest) => {
    try {
      const result = await handler(req);
      return result instanceof Response ? result : json(result);
    } catch (error) {
      if (error instanceof ApiError) {
        return json({ error: error.message }, error.status);
      }
      console.error('Route error:', error);
      return json({ error: 'Internal server error' }, 500);
    }
  };

/**
 * Wrapper for protected API routes that require authentication.
 * Automatically injects the authenticated user into the handler.
 */
export const protectedRoute =
  <T>(handler: (req: NextRequest, user: User) => Promise<T | Response> | T | Response) =>
  async (req: NextRequest) => {
    try {
      const user = await getSessionUser();
      if (!user) {
        return json({ error: 'Authentication required' }, 401);
      }
      const result = await handler(req, user);
      return result instanceof Response ? result : json(result);
    } catch (error) {
      if (error instanceof ApiError) {
        return json({ error: error.message }, error.status);
      }
      console.error('Route error:', error);
      return json({ error: 'Internal server error' }, 500);
    }
  };

export const requireString = (value: unknown, label: string) => {
  const str = typeof value === 'string' ? value.trim() : '';
  if (!str) {
    throw new ApiError(400, `${label} required`);
  }
  return str;
};

export const requireUser = (value: unknown): User => {
  const id = requireString(value, 'User ID');
  const user = getUserById(id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  return user;
};

/**
 * Get the authenticated user from the session.
 * Throws 401 if not authenticated.
 */
export const requireSession = async (): Promise<User> => {
  const user = await getSessionUser();
  if (!user) {
    throw new ApiError(401, 'Authentication required');
  }
  return user;
};

export const suffix = (value: string | null | undefined, len = 10) =>
  value ? value.slice(-len) : null;

export const readJson = async <T = unknown>(req: Request): Promise<Partial<T>> => {
  try {
    return await req.json();
  } catch {
    return {} as Partial<T>;
  }
};
