import type { NextRequest } from 'next/server';
import { getUserById, type User } from './db';

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

export const suffix = (value: string | null | undefined, len = 10) =>
  value ? value.slice(-len) : null;

export const readJson = async <T = unknown>(req: Request): Promise<Partial<T>> => {
  try {
    return await req.json();
  } catch {
    return {} as Partial<T>;
  }
};
