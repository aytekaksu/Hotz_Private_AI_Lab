import type { User } from '@/lib/db';
import { protectedRoute, requireString, readJson, suffix } from '@/lib/api';

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
  const GET = protectedRoute(async (_req, user) => {
    const storedKey = await getUserKey(user.id);
    const hasKey = typeof storedKey === 'string' && storedKey.trim().length > 0;
    return {
      hasKey,
      keySuffix: hasKey ? suffix(storedKey) : null,
    };
  });

  const POST = protectedRoute(async (req, user) => {
    const body = await readJson<{ apiKey: string }>(req);
    const apiKey = requireString(body.apiKey, 'API key');
    await updateUserKey(user.id, apiKey);
    return {
      success: true,
      ...(messages?.save ? { message: messages.save } : {}),
      keySuffix: suffix(apiKey),
    };
  });

  const DELETE = protectedRoute(async (_req, user) => {
    await updateUserKey(user.id, '');
    return {
      success: true,
      ...(messages?.remove ? { message: messages.remove } : {}),
    };
  });

  return { GET, POST, DELETE };
};
