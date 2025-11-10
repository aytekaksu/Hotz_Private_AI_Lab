import { getUserAnthropicKey, updateUserAnthropicKey } from '@/lib/db';
import { createApiKeyHandlers } from '../api-key-handler';

export const runtime = 'nodejs';

const { GET, POST, DELETE } = createApiKeyHandlers({
  keyField: 'anthropic_api_key',
  getUserKey: getUserAnthropicKey,
  updateUserKey: updateUserAnthropicKey,
});

export { GET, POST, DELETE };
