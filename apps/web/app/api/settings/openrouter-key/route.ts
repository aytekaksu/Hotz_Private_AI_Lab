import { getUserOpenRouterKey, updateUserOpenRouterKey } from '@/lib/db';
import { createApiKeyHandlers } from '../api-key-handler';

export const runtime = 'nodejs';

const { GET, POST, DELETE } = createApiKeyHandlers({
  keyField: 'openrouter_api_key',
  getUserKey: getUserOpenRouterKey,
  updateUserKey: updateUserOpenRouterKey,
  messages: {
    save: 'API key saved successfully',
    remove: 'API key removed successfully',
  },
});

export { GET, POST, DELETE };
