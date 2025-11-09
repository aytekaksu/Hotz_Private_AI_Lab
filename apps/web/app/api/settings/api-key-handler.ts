import { NextRequest } from 'next/server';
import type { User } from '@/lib/db';
import { route, requireUser, requireString, readJson, suffix } from '@/lib/api';

type ApiKeyHandlerOptions = {
  keyField: keyof User;
  getUserKey: (userId: string) => Promise<string | null> | string | null;
  updateUserKey: (userId: string, apiKey: string) => Promise<void> | void;
  messages?: {
    save?: string;
    remove?: string;
  };
};

export const createApiKeyHandlers = ({ keyField, getUserKey, updateUserKey, messages }: ApiKeyHandlerOptions) => {
  const GET = route(async (req: NextRequest) => {
    const user = requireUser(req.nextUrl.searchParams.get('userId'));
    return {
      hasKey: Boolean(user[keyField]),
      keySuffix: suffix(await getUserKey(user.id)),
    };
  });

  const POST = route(async (req: NextRequest) => {
    const body = await readJson<{ userId: string; apiKey: string }>(req);
    const user = requireUser(body.userId);
    const apiKey = requireString(body.apiKey, 'API key');
    await updateUserKey(user.id, apiKey);
    return {
      success: true,
      ...(messages?.save ? { message: messages.save } : {}),
      keySuffix: suffix(apiKey),
    };
  });

  const DELETE = route(async (req: NextRequest) => {
    const body = await readJson<{ userId: string }>(req);
    const user = requireUser(body.userId);
    await updateUserKey(user.id, '');
    return {
      success: true,
      ...(messages?.remove ? { message: messages.remove } : {}),
    };
  });

  return { GET, POST, DELETE };
};
