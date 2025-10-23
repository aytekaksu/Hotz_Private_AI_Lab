import { encryptField, decryptField } from '../encryption';

type DBLike = {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => any;
  close: () => void;
};

let db: DBLike | null = null;

export function getDb(): DBLike {
  if (!db) {
    const dbPath = process.env.DATABASE_URL?.replace('file://', '') || './data/app.db';
    // Prefer bun:sqlite when running under Bun, fallback to better-sqlite3 on Node
    try {
      // @ts-ignore - require available in Node/Bun
      const isBun = typeof (globalThis as any).Bun !== 'undefined';
      if (isBun) {
        // @ts-ignore - bun:sqlite is provided by Bun at runtime
        const { Database: BunDatabase } = require('bun:sqlite');
        const instance = new BunDatabase(dbPath);
        instance.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;');
        db = instance;
      } else {
        // @ts-ignore - CJS require for Node
        const BetterSqlite3 = require('better-sqlite3');
        const instance = new BetterSqlite3(dbPath);
        instance.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;');
        db = instance;
      }
    } catch (e) {
      // Final fallback to better-sqlite3 if bun:sqlite is unavailable
      // @ts-ignore - CJS require for Node
      const BetterSqlite3 = require('better-sqlite3');
      const instance = new BetterSqlite3(dbPath);
      instance.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;');
      db = instance;
    }
  }
  return db!;
}

// Types
export interface User {
  id: string;
  email: string;
  openrouter_api_key?: string;
  anthropic_api_key?: string;
  active_ai_provider?: 'openrouter' | 'anthropic' | null;
  default_model?: string | null;
  default_routing_variant?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  agent_id?: string | null;
  created_at: string;
  updated_at: string;
  // Optional denormalized fields when joined
  agent_name?: string | null;
  agent_slug?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: string;
  tokens?: number;
  created_at: string;
}

export interface Attachment {
  id: string;
  message_id?: string;
  filename: string;
  mimetype: string;
  size: number;
  path: string;
  text_content?: string;
  created_at: string;
}

export interface OAuthCredential {
  id: string;
  user_id: string;
  provider: 'google' | 'notion';
  access_token: string; // encrypted
  refresh_token?: string; // encrypted
  scope?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

// User operations
export function createUser(email: string): User {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
  `);
  
  const id = crypto.randomUUID();
  stmt.run(id, email);
  
  return getUserById(id)!;
}

export function getUserById(id: string): User | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const user = stmt.get(id) as User | undefined;
  return user || null;
}

export function getUserByEmail(email: string): User | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  const user = stmt.get(email) as User | undefined;
  return user || null;
}

export function updateUserOpenRouterKey(userId: string, apiKey: string): void {
  const db = getDb();
  const encryptedKey = encryptField(apiKey);
  const stmt = db.prepare(`
    UPDATE users 
    SET openrouter_api_key = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(encryptedKey, userId);
}

export function getUserOpenRouterKey(userId: string): string | null {
  const user = getUserById(userId);
  if (!user?.openrouter_api_key) return null;
  try {
    return decryptField(user.openrouter_api_key);
  } catch (error) {
    console.error('Failed to decrypt OpenRouter key:', error);
    return null;
  }
}

export function updateUserAnthropicKey(userId: string, apiKey: string): void {
  const db = getDb();
  const encryptedKey = encryptField(apiKey);
  const stmt = db.prepare(`
    UPDATE users 
    SET anthropic_api_key = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(encryptedKey, userId);
}

export function getUserAnthropicKey(userId: string): string | null {
  const user = getUserById(userId);
  if (!user?.anthropic_api_key) return null;
  try {
    return decryptField(user.anthropic_api_key);
  } catch (error) {
    console.error('Failed to decrypt Anthropic key:', error);
    return null;
  }
}

export function getActiveAIProvider(userId: string): 'openrouter' | 'anthropic' {
  const user = getUserById(userId);
  const val = (user?.active_ai_provider as any) || null;
  if (val === 'anthropic' || val === 'openrouter') return val;
  return 'openrouter';
}

export function setActiveAIProvider(userId: string, provider: 'openrouter' | 'anthropic'): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE users
    SET active_ai_provider = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(provider, userId);
}

// User default model & routing variant
export function getUserModelDefaults(userId: string): { model: string | null; routingVariant: string | null } {
  const user = getUserById(userId) as (User & { default_model?: string | null; default_routing_variant?: string | null }) | null;
  return {
    model: user?.default_model ?? null,
    routingVariant: user?.default_routing_variant ?? null,
  };
}

export function updateUserModelDefaults(userId: string, model: string | null, routingVariant: string | null): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE users
    SET default_model = ?, default_routing_variant = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(model || null, routingVariant || null, userId);
}

// Conversation operations
export function createConversation(userId: string, title: string): Conversation {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO conversations (id, user_id, title, agent_id, created_at, updated_at)
    VALUES (?, ?, ?, NULL, datetime('now'), datetime('now'))
  `);
  
  const id = crypto.randomUUID();
  stmt.run(id, userId, title);
  
  return getConversationById(id)!;
}

export function getConversationById(id: string): Conversation | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT c.*, a.name AS agent_name, a.slug AS agent_slug
    FROM conversations c
    LEFT JOIN agents a ON a.id = c.agent_id
    WHERE c.id = ?
  `);
  const conversation = stmt.get(id) as Conversation | undefined;
  return conversation || null;
}

export function getConversationsByUserId(userId: string): Conversation[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT c.*, a.name AS agent_name, a.slug AS agent_slug
    FROM conversations c
    LEFT JOIN agents a ON a.id = c.agent_id
    WHERE c.user_id = ? 
    ORDER BY c.updated_at DESC
  `);
  return stmt.all(userId) as Conversation[];
}

export function updateConversationTitle(id: string, title: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE conversations 
    SET title = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(title, id);
}

export function deleteConversation(id: string): void {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM conversations WHERE id = ?');
  stmt.run(id);
}

// Message operations
export function createMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  toolCalls?: any,
  tokens?: number
): Message {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, tool_calls, tokens, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  
  const id = crypto.randomUUID();
  const toolCallsJson = toolCalls ? JSON.stringify(toolCalls) : null;
  stmt.run(id, conversationId, role, content, toolCallsJson, tokens || null);
  
  // Update conversation timestamp
  const updateStmt = db.prepare(`
    UPDATE conversations 
    SET updated_at = datetime('now')
    WHERE id = ?
  `);
  updateStmt.run(conversationId);
  
  return getMessageById(id)!;
}

export function getMessageById(id: string): Message | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM messages WHERE id = ?');
  const message = stmt.get(id) as Message | undefined;
  return message || null;
}

export function getMessagesByConversationId(conversationId: string): Message[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM messages 
    WHERE conversation_id = ? 
    ORDER BY created_at ASC
  `);
  return stmt.all(conversationId) as Message[];
}

// Attachment operations
export function createAttachment(
  filename: string,
  mimetype: string,
  size: number,
  path: string,
  textContent?: string
): Attachment {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO attachments (id, filename, mimetype, size, path, text_content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  
  const id = crypto.randomUUID();
  stmt.run(id, filename, mimetype, size, path, textContent || null);
  
  return getAttachmentById(id)!;
}

export function getAttachmentById(id: string): Attachment | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM attachments WHERE id = ?');
  const attachment = stmt.get(id) as Attachment | undefined;
  return attachment || null;
}

export function getAttachmentsByIds(ids: string[]): Attachment[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT * FROM attachments WHERE id IN (${placeholders})`);
  return stmt.all(...ids) as Attachment[];
}

export function setAttachmentMessage(attachmentId: string, messageId: string): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE attachments SET message_id = ? WHERE id = ?');
  stmt.run(messageId, attachmentId);
}

export function getAttachmentsByMessageId(messageId: string): Attachment[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM attachments WHERE message_id = ?');
  return stmt.all(messageId) as Attachment[];
}

// OAuth Credential operations
export function storeOAuthCredential(
  userId: string,
  provider: 'google' | 'notion',
  accessToken: string,
  refreshToken?: string,
  scope?: string,
  expiresAt?: Date
): OAuthCredential {
  const db = getDb();
  
  const encryptedAccessToken = encryptField(accessToken);
  const encryptedRefreshToken = refreshToken ? encryptField(refreshToken) : null;
  const expiresAtStr = expiresAt ? expiresAt.toISOString() : null;
  
  // Check if credential exists
  const existing = getOAuthCredential(userId, provider);
  
  if (existing) {
    // Update existing credential
    const stmt = db.prepare(`
      UPDATE oauth_credentials 
      SET access_token = ?, refresh_token = ?, scope = ?, expires_at = ?, updated_at = datetime('now')
      WHERE user_id = ? AND provider = ?
    `);
    stmt.run(encryptedAccessToken, encryptedRefreshToken, scope || null, expiresAtStr, userId, provider);
    return getOAuthCredential(userId, provider)!;
  } else {
    // Insert new credential
    const stmt = db.prepare(`
      INSERT INTO oauth_credentials (id, user_id, provider, access_token, refresh_token, scope, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    
    const id = crypto.randomUUID();
    stmt.run(id, userId, provider, encryptedAccessToken, encryptedRefreshToken, scope || null, expiresAtStr);
    
    return getOAuthCredential(userId, provider)!;
  }
}

export function getOAuthCredential(userId: string, provider: 'google' | 'notion'): OAuthCredential | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM oauth_credentials 
    WHERE user_id = ? AND provider = ?
  `);
  const credential = stmt.get(userId, provider) as OAuthCredential | undefined;
  return credential || null;
}

export function getDecryptedOAuthCredential(userId: string, provider: 'google' | 'notion'): {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  expiresAt?: Date;
} | null {
  const credential = getOAuthCredential(userId, provider);
  if (!credential) return null;
  
  try {
    return {
      accessToken: decryptField(credential.access_token),
      refreshToken: credential.refresh_token ? decryptField(credential.refresh_token) : undefined,
      scope: credential.scope || undefined,
      expiresAt: credential.expires_at ? new Date(credential.expires_at) : undefined,
    };
  } catch (error) {
    console.error('Failed to decrypt OAuth credential:', error);
    return null;
  }
}

export function deleteOAuthCredential(userId: string, provider: 'google' | 'notion'): void {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM oauth_credentials WHERE user_id = ? AND provider = ?');
  stmt.run(userId, provider);
}

// Conversation Tools operations
export function getConversationTools(conversationId: string): Array<{tool_name: string, enabled: boolean}> {
  const db = getDb();
  const stmt = db.prepare('SELECT tool_name, enabled FROM conversation_tools WHERE conversation_id = ?');
  const results = stmt.all(conversationId) as Array<{tool_name: string, enabled: number}>;
  return results.map(r => ({ tool_name: r.tool_name, enabled: r.enabled === 1 }));
}

export function setConversationToolEnabled(conversationId: string, toolName: string, enabled: boolean): void {
  const db = getDb();
  const enabledInt = enabled ? 1 : 0;
  
  // Try to update first
  const updateStmt = db.prepare('UPDATE conversation_tools SET enabled = ? WHERE conversation_id = ? AND tool_name = ?');
  const result = updateStmt.run(enabledInt, conversationId, toolName);
  
  // If no rows were updated, insert new row
  if (result.changes === 0) {
    const insertStmt = db.prepare(`
      INSERT INTO conversation_tools (id, conversation_id, tool_name, enabled, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    const id = crypto.randomUUID();
    insertStmt.run(id, conversationId, toolName, enabledInt);
  }
}

export function initializeDefaultTools(conversationId: string): void {
  const db = getDb();
  
  // List of all tool names (matches tools in definitions.ts)
  const toolNames = [
    'list_calendar_events',
    'create_calendar_event',
    'update_calendar_event',
    'delete_calendar_event',
    'list_tasks',
    'create_task',
    'update_task',
    'complete_task',
    'query_notion_database',
    'create_notion_page',
    'update_notion_page',
    'append_notion_blocks',
    'get_notion_page',
  ];
  
  // Insert all tools as disabled by default
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO conversation_tools (id, conversation_id, tool_name, enabled, created_at)
    VALUES (?, ?, ?, 0, datetime('now'))
  `);
  
  for (const toolName of toolNames) {
    const id = crypto.randomUUID();
    stmt.run(id, conversationId, toolName);
  }
}

// Agents
export interface Agent {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  extra_system_prompt?: string | null;
  override_system_prompt?: string | null;
  instructions_attachment_id?: string | null;
  instructions_attachment_name?: string | null;
  created_at: string;
  updated_at: string;
}

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function createAgent(userId: string, name: string): Agent {
  const db = getDb();
  const id = crypto.randomUUID();
  const slug = slugifyName(name);
  const stmt = db.prepare(`
    INSERT INTO agents (id, user_id, name, slug, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  stmt.run(id, userId, name, slug);
  return getAgentById(id)!;
}

export function getAgentById(id: string): Agent | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM agents WHERE id = ?');
  const row = stmt.get(id) as Agent | undefined;
  return row || null;
}

export function getAgentBySlug(userId: string, slug: string): Agent | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM agents WHERE user_id = ? AND slug = ?');
  const row = stmt.get(userId, slug) as Agent | undefined;
  return row || null;
}

export function listAgents(userId: string): Agent[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM agents WHERE user_id = ? ORDER BY updated_at DESC');
  return stmt.all(userId) as Agent[];
}

export function updateAgent(
  id: string,
  fields: Partial<Pick<Agent, 'name' | 'slug' | 'extra_system_prompt' | 'override_system_prompt' | 'instructions_attachment_id' | 'instructions_attachment_name'>>,
): Agent | null {
  const db = getDb();
  const current = getAgentById(id);
  if (!current) return null;
  const name = fields.name ?? current.name;
  const slug = fields.slug ?? current.slug;
  const extra = fields.extra_system_prompt ?? current.extra_system_prompt ?? null;
  const override = fields.override_system_prompt ?? current.override_system_prompt ?? null;
  const attachId = fields.instructions_attachment_id ?? (current as any).instructions_attachment_id ?? null;
  const attachName = fields.instructions_attachment_name ?? (current as any).instructions_attachment_name ?? null;
  const stmt = db.prepare(`
    UPDATE agents
    SET name = ?, slug = ?, extra_system_prompt = ?, override_system_prompt = ?, instructions_attachment_id = ?, instructions_attachment_name = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(name, slug, extra, override, attachId, attachName, id);
  return getAgentById(id);
}

export function deleteAgent(id: string): void {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM agents WHERE id = ?');
  stmt.run(id);
}

// Agent tool defaults
export function getAgentTools(agentId: string): Array<{ tool_name: string; enabled: boolean }> {
  const db = getDb();
  const stmt = db.prepare('SELECT tool_name, enabled FROM agent_tools WHERE agent_id = ?');
  const results = stmt.all(agentId) as Array<{ tool_name: string; enabled: number }>;
  return results.map((r) => ({ tool_name: r.tool_name, enabled: r.enabled === 1 }));
}

export function setAgentToolEnabled(agentId: string, toolName: string, enabled: boolean): void {
  const db = getDb();
  const enabledInt = enabled ? 1 : 0;
  const update = db.prepare('UPDATE agent_tools SET enabled = ?, updated_at = datetime(\'now\') WHERE agent_id = ? AND tool_name = ?');
  const res = update.run(enabledInt, agentId, toolName);
  if (res.changes === 0) {
    const insert = db.prepare(`
      INSERT INTO agent_tools (id, agent_id, tool_name, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    insert.run(crypto.randomUUID(), agentId, toolName, enabledInt);
  }
}

export function initializeAgentTools(agentId: string): void {
  const db = getDb();
  const toolNames = [
    'list_calendar_events',
    'create_calendar_event',
    'update_calendar_event',
    'delete_calendar_event',
    'list_tasks',
    'create_task',
    'update_task',
    'complete_task',
    'query_notion_database',
    'create_notion_page',
    'update_notion_page',
    'append_notion_blocks',
    'get_notion_page',
  ];
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO agent_tools (id, agent_id, tool_name, enabled, created_at, updated_at)
    VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))
  `);
  for (const toolName of toolNames) {
    stmt.run(crypto.randomUUID(), agentId, toolName);
  }
}

export function initializeToolsFromAgent(conversationId: string, agentId: string): void {
  const db = getDb();
  // ensure all conversation tools exist
  initializeDefaultTools(conversationId);
  // copy enabled defaults from agent
  const enabled = getAgentTools(agentId).filter((t) => t.enabled).map((t) => t.tool_name);
  for (const tool of enabled) {
    setConversationToolEnabled(conversationId, tool, true);
  }
}

export function setConversationAgent(conversationId: string, agentId: string | null): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE conversations SET agent_id = ?, updated_at = datetime(\'now\') WHERE id = ?');
  stmt.run(agentId, conversationId);
}

export function createConversationWithAgent(userId: string, title: string, agentId?: string | null): Conversation {
  const db = getDb();
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO conversations (id, user_id, title, agent_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  stmt.run(id, userId, title, agentId || null);
  return getConversationById(id)!;
}
