import fs from 'fs';
import type { Database as BunDatabase } from 'bun:sqlite';
import { encryptField, decryptField } from '../encryption';
import { assertBunRuntime } from '../utils/runtime';

let db: BunDatabase | null = null;

function loadSqlite(): typeof import('bun:sqlite') {
  assertBunRuntime('SQLite database access');
  return require('bun:sqlite') as typeof import('bun:sqlite');
}

function resolveDbPath(url: string | undefined): string {
  if (!url) return './data/app.db';
  if (url.startsWith('file://')) {
    return url.slice('file://'.length);
  }
  if (url.startsWith('file:')) {
    return url.slice('file:'.length);
  }
  return url;
}

function openDatabase(): BunDatabase {
  const { Database } = loadSqlite();
  const dbPath = resolveDbPath(process.env.DATABASE_URL);
  const instance = new Database(dbPath);
  instance.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;');
  return instance;
}

export function getDb(): BunDatabase {
  if (!db) {
    db = openDatabase();
  }
  return db;
}

// Types
export interface User {
  id: string;
  email: string;
  openrouter_api_key?: string;
  anthropic_api_key?: string | null;
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
  folder_path?: string | null;
  is_library?: number | boolean;
  is_encrypted?: number | boolean;
  encryption_password_hash?: string | null;
  failed_attempts?: number;
  created_at: string;
}

export interface AttachmentFolder {
  id: string;
  name: string;
  path: string;
  parent_path?: string | null;
  created_at: string;
}

const isSubpath = (target: string, parent: string) => {
  if (parent === '/') return target.startsWith('/');
  return target === parent || target.startsWith(parent.endsWith('/') ? parent : `${parent}/`);
};

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
  account_email?: string | null;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  projectId?: string | null;
  authUri?: string | null;
  tokenUri?: string | null;
  authProviderCertUrl?: string | null;
  redirectUris?: string[];
  javascriptOrigins?: string[];
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

export async function updateUserOpenRouterKey(userId: string, apiKey: string): Promise<void> {
  const db = getDb();
  const encryptedKey = await encryptField(apiKey);
  const stmt = db.prepare(`
    UPDATE users 
    SET openrouter_api_key = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(encryptedKey, userId);
}

export async function getUserOpenRouterKey(userId: string): Promise<string | null> {
  const user = getUserById(userId);
  if (!user?.openrouter_api_key) return null;
  try {
    return await decryptField(user.openrouter_api_key);
  } catch (error) {
    console.error('Failed to decrypt OpenRouter key:', error);
    return null;
  }
}

export async function updateUserAnthropicKey(userId: string, apiKey: string): Promise<void> {
  const db = getDb();
  const encryptedKey = apiKey ? await encryptField(apiKey) : '';
  const stmt = db.prepare(`
    UPDATE users
    SET anthropic_api_key = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(encryptedKey || null, userId);
}

export async function getUserAnthropicKey(userId: string): Promise<string | null> {
  const user = getUserById(userId);
  const encrypted = user?.anthropic_api_key;
  if (!encrypted) return null;
  try {
    return await decryptField(encrypted);
  } catch (error) {
    console.error('Failed to decrypt Anthropic key:', error);
    return null;
  }
}

export function getUserModelDefaults(userId: string): { model: string | null; routingVariant: string | null } {
  const user = getUserById(userId);
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

export function getActiveAIProvider(userId: string): 'openrouter' | 'anthropic' {
  const user = getUserById(userId);
  const provider = user?.active_ai_provider;
  return provider === 'anthropic' ? 'anthropic' : 'openrouter';
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
export const normalizeFolderPath = (path?: string | null): string => {
  const raw = typeof path === 'string' ? path : '/';
  let normalized = raw.trim() || '/';
  normalized = normalized.replace(/\\/g, '/');
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/+/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized || '/';
};

const sanitizeFolderName = (name: string): string => {
  return (name || '').trim().replace(/[\\/]+/g, '-');
};

export function createAttachment(
  filename: string,
  mimetype: string,
  size: number,
  path: string,
  textContent?: string,
  folderPath?: string,
  isLibrary = true,
  options: { isEncrypted?: boolean; encryptionPasswordHash?: string | null } = {},
): Attachment {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO attachments (id, filename, mimetype, size, path, text_content, folder_path, is_library, is_encrypted, encryption_password_hash, failed_attempts, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
  `);
  
  const id = crypto.randomUUID();
  stmt.run(
    id,
    filename,
    mimetype,
    size,
    path,
    textContent || null,
    normalizeFolderPath(folderPath),
    isLibrary ? 1 : 0,
    options.isEncrypted ? 1 : 0,
    options.encryptionPasswordHash || null,
  );
  
  return getAttachmentById(id)!;
}

export function getAttachmentById(id: string): Attachment | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      *,
      COALESCE(folder_path, '/') as folder_path,
      COALESCE(is_library, 0) as is_library,
      COALESCE(is_encrypted, 0) as is_encrypted,
      COALESCE(failed_attempts, 0) as failed_attempts
    FROM attachments
    WHERE id = ?
  `);
  const attachment = stmt.get(id) as Attachment | undefined;
  return attachment || null;
}

export function getAttachmentsByIds(ids: string[]): Attachment[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT 
      *,
      COALESCE(folder_path, '/') as folder_path,
      COALESCE(is_library, 0) as is_library,
      COALESCE(is_encrypted, 0) as is_encrypted,
      COALESCE(failed_attempts, 0) as failed_attempts
    FROM attachments
    WHERE id IN (${placeholders})
  `);
  return stmt.all(...ids) as Attachment[];
}

export function setAttachmentMessage(attachmentId: string, messageId: string): Attachment | null {
  const db = getDb();
  const attachment = getAttachmentById(attachmentId);
  if (!attachment) return null;

  if (attachment.is_library) {
    const stmt = db.prepare(`
      INSERT INTO attachments (id, message_id, filename, mimetype, size, path, text_content, folder_path, is_library, is_encrypted, encryption_password_hash, failed_attempts, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, datetime('now'))
    `);
    const cloneId = crypto.randomUUID();
    stmt.run(
      cloneId,
      messageId,
      attachment.filename,
      attachment.mimetype,
      attachment.size,
      attachment.path,
      attachment.text_content || null,
      attachment.folder_path || '/',
      attachment.is_encrypted ? 1 : 0,
      attachment.encryption_password_hash || null,
    );
    return getAttachmentById(cloneId);
  }

  const stmt = db.prepare('UPDATE attachments SET message_id = ? WHERE id = ?');
  stmt.run(messageId, attachmentId);
  return getAttachmentById(attachmentId);
}

export function getAttachmentsByMessageId(messageId: string): Attachment[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      *,
      COALESCE(folder_path, '/') as folder_path,
      COALESCE(is_library, 0) as is_library,
      COALESCE(is_encrypted, 0) as is_encrypted,
      COALESCE(failed_attempts, 0) as failed_attempts
    FROM attachments 
    WHERE message_id = ?
  `);
  return stmt.all(messageId) as Attachment[];
}

export function promoteAttachmentToLibrary(id: string, folderPath: string = '/'): Attachment | null {
  const db = getDb();
  const normalized = normalizeFolderPath(folderPath);
  db.prepare('UPDATE attachments SET is_library = 1, folder_path = ? WHERE id = ?').run(normalized, id);
  return getAttachmentById(id);
}

export function renameLibraryAttachment(id: string, newName: string): Attachment | null {
  const db = getDb();
  const trimmed = (newName || '').trim();
  if (!trimmed) return null;
  db.prepare('UPDATE attachments SET filename = ? WHERE id = ? AND COALESCE(is_library, 0) = 1').run(trimmed, id);
  return getAttachmentById(id);
}

export function getAttachmentFolders(parentPath: string = '/'): AttachmentFolder[] {
  const db = getDb();
  const normalized = normalizeFolderPath(parentPath);
  const stmt = db.prepare('SELECT * FROM attachment_folders WHERE COALESCE(parent_path, \'/\') = ? ORDER BY name ASC');
  return stmt.all(normalized) as AttachmentFolder[];
}

export function getAttachmentFolderByPath(path: string): AttachmentFolder | null {
  const db = getDb();
  const normalized = normalizeFolderPath(path);
  const stmt = db.prepare('SELECT * FROM attachment_folders WHERE path = ?');
  const folder = stmt.get(normalized) as AttachmentFolder | undefined;
  return folder || null;
}

export function createAttachmentFolder(name: string, parentPath: string = '/'): AttachmentFolder {
  const db = getDb();
  const sanitized = sanitizeFolderName(name);
  if (!sanitized) {
    throw new Error('Folder name is required');
  }
  const parent = normalizeFolderPath(parentPath);
  if (parent !== '/' && !getAttachmentFolderByPath(parent)) {
    throw new Error('Parent folder not found');
  }
  const basePath = normalizeFolderPath(parent === '/' ? `/${sanitized}` : `${parent}/${sanitized}`);

  let candidatePath = basePath;
  let suffix = 1;
  while (getAttachmentFolderByPath(candidatePath)) {
    candidatePath = normalizeFolderPath(`${basePath}-${suffix}`);
    suffix += 1;
  }

  const stmt = db.prepare(`
    INSERT INTO attachment_folders (id, name, path, parent_path, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  const id = crypto.randomUUID();
  stmt.run(id, sanitized, candidatePath, parent);
  return getAttachmentFolderByPath(candidatePath)!;
}

export function deleteAttachmentFolder(path: string): void {
  const db = getDb();
  const normalized = normalizeFolderPath(path);
  if (normalized === '/') {
    throw new Error('Cannot delete root folder');
  }
  const folders = db
    .prepare('SELECT path FROM attachment_folders WHERE path = ? OR path LIKE ?')
    .all(normalized, `${normalized}/%`) as Array<{ path: string }>;
  const folderPaths = folders.map((f) => f.path);

  const attachments = db
    .prepare(
      `SELECT id, path FROM attachments WHERE COALESCE(is_library,0)=1 AND (COALESCE(folder_path,'/') = ? OR COALESCE(folder_path,'/') LIKE ?)`,
    )
    .all(normalized, `${normalized}/%`) as Array<{ id: string; path: string }>;

  const attachmentIds = attachments.map((a) => a.id);
  if (attachmentIds.length > 0) {
    db.prepare(`DELETE FROM attachments WHERE id IN (${attachmentIds.map(() => '?').join(',')})`).run(...attachmentIds);
    try {
      db.prepare(`DELETE FROM agent_default_files WHERE attachment_id IN (${attachmentIds.map(() => '?').join(',')})`).run(
        ...attachmentIds,
      );
    } catch {}
  }

  if (folderPaths.length > 0) {
    db.prepare(`DELETE FROM attachment_folders WHERE path IN (${folderPaths.map(() => '?').join(',')})`).run(
      ...folderPaths,
    );
  }
}

export function getAttachmentsInFolder(folderPath: string = '/', libraryOnly = true): Attachment[] {
  const db = getDb();
  const normalized = normalizeFolderPath(folderPath);
  const stmt = db.prepare(
    `
      SELECT 
        *,
        COALESCE(folder_path, '/') as folder_path,
        COALESCE(is_library, 0) as is_library,
        COALESCE(is_encrypted, 0) as is_encrypted,
        COALESCE(failed_attempts, 0) as failed_attempts
      FROM attachments 
      WHERE COALESCE(folder_path, '/') = ?
      ${libraryOnly ? 'AND COALESCE(is_library, 0) = 1' : ''}
      ORDER BY created_at DESC
    `,
  );
  return stmt.all(normalized) as Attachment[];
}

export function deleteAttachment(id: string): boolean {
  const db = getDb();
  const attachment = getAttachmentById(id);
  if (!attachment) return false;

  try {
    db.prepare('DELETE FROM agent_default_files WHERE attachment_id = ?').run(id);
  } catch {}

  db.prepare('DELETE FROM attachments WHERE id = ?').run(id);

  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM attachments WHERE path = ?').get(attachment.path) as { count: number } | undefined;
    const remaining = count?.count ?? 0;
    if (remaining === 0) {
      try {
        fs.rmSync(attachment.path, { force: true });
      } catch (err) {
        console.error('Failed to remove attachment file from disk:', err);
      }
    }
  } catch (error) {
    console.error('Failed to clean up attachment file:', error);
  }

  return true;
}

export function incrementAttachmentFailures(id: string): number | null {
  const db = getDb();
  const existing = getAttachmentById(id);
  if (!existing) return null;
  db.prepare('UPDATE attachments SET failed_attempts = COALESCE(failed_attempts, 0) + 1 WHERE id = ?').run(id);
  const row = db.prepare('SELECT failed_attempts FROM attachments WHERE id = ?').get(id) as { failed_attempts: number } | undefined;
  return row?.failed_attempts ?? null;
}

export function resetAttachmentFailures(id: string): void {
  const db = getDb();
  db.prepare('UPDATE attachments SET failed_attempts = 0 WHERE id = ?').run(id);
}

export function renameAttachmentFolder(path: string, newName: string): AttachmentFolder | null {
  const db = getDb();
  const normalized = normalizeFolderPath(path);
  if (normalized === '/') {
    throw new Error('Cannot rename root folder');
  }
  const folder = getAttachmentFolderByPath(normalized);
  if (!folder) return null;
  const parent = normalizeFolderPath(folder.parent_path || '/');
  const sanitized = sanitizeFolderName(newName);
  if (!sanitized) {
    throw new Error('Folder name is required');
  }
  const basePath = normalizeFolderPath(parent === '/' ? `/${sanitized}` : `${parent}/${sanitized}`);

  let candidatePath = basePath;
  let suffix = 1;
  while (getAttachmentFolderByPath(candidatePath)) {
    candidatePath = normalizeFolderPath(`${basePath}-${suffix}`);
    suffix += 1;
  }

  const oldPrefix = normalized.endsWith('/') ? normalized : `${normalized}`;
  const newPrefix = candidatePath;

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE attachment_folders SET name = ?, path = ? WHERE path = ?').run(
      sanitized,
      candidatePath,
      normalized,
    );
    db.prepare('UPDATE attachment_folders SET path = REPLACE(path, ?, ?) WHERE path LIKE ?').run(
      `${oldPrefix}/`,
      `${newPrefix}/`,
      `${oldPrefix}/%`,
    );
    db.prepare(
      'UPDATE attachments SET folder_path = REPLACE(COALESCE(folder_path,"/"), ?, ?) WHERE COALESCE(folder_path,"/") LIKE ? AND COALESCE(is_library,0)=1',
    ).run(`${oldPrefix}`, `${newPrefix}`, `${oldPrefix}%`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return getAttachmentFolderByPath(candidatePath);
}

export function getAgentDefaultAttachments(agentId: string): Attachment[] {
  const db = getDb();
  const stmt = db.prepare(
    `
    SELECT a.*, COALESCE(a.folder_path,'/') as folder_path, COALESCE(a.is_library,0) as is_library, COALESCE(a.is_encrypted,0) as is_encrypted, COALESCE(a.failed_attempts,0) as failed_attempts
    FROM attachments a
    INNER JOIN agent_default_files f ON f.attachment_id = a.id
    WHERE f.agent_id = ?
    ORDER BY f.created_at DESC
  `,
  );
  return stmt.all(agentId) as Attachment[];
}

export function setAgentDefaultAttachments(agentId: string, attachmentIds: string[]): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM agent_default_files WHERE agent_id = ?').run(agentId);
    const stmt = db.prepare(
      'INSERT INTO agent_default_files (id, agent_id, attachment_id, created_at) VALUES (?, ?, ?, datetime("now"))',
    );
    for (const id of attachmentIds) {
      stmt.run(crypto.randomUUID(), agentId, id);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// OAuth Credential operations
export async function storeOAuthCredential(
  userId: string,
  provider: 'google' | 'notion',
  accessToken: string,
  refreshToken?: string,
  scope?: string,
  expiresAt?: Date,
  accountEmail?: string | null
): Promise<OAuthCredential> {
  const db = getDb();
  
  const encryptedAccessToken = await encryptField(accessToken);
  const encryptedRefreshToken = refreshToken ? await encryptField(refreshToken) : null;
  const expiresAtStr = expiresAt ? expiresAt.toISOString() : null;
  
  const existing = getOAuthCredential(userId, provider);
  const nextAccountEmail = accountEmail ?? existing?.account_email ?? null;

  const run = (includeAccountEmail: boolean): OAuthCredential => {
    const updateSql = includeAccountEmail
      ? `UPDATE oauth_credentials
         SET access_token = ?, refresh_token = ?, scope = ?, expires_at = ?, account_email = ?, updated_at = datetime('now')
         WHERE user_id = ? AND provider = ?`
      : `UPDATE oauth_credentials
         SET access_token = ?, refresh_token = ?, scope = ?, expires_at = ?, updated_at = datetime('now')
         WHERE user_id = ? AND provider = ?`;

    const insertSql = includeAccountEmail
      ? `INSERT INTO oauth_credentials (id, user_id, provider, access_token, refresh_token, scope, expires_at, account_email, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      : `INSERT INTO oauth_credentials (id, user_id, provider, access_token, refresh_token, scope, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;

    if (existing) {
      const params = includeAccountEmail
        ? [
            encryptedAccessToken,
            encryptedRefreshToken,
            scope || null,
            expiresAtStr,
            nextAccountEmail,
            userId,
            provider,
          ]
        : [
            encryptedAccessToken,
            encryptedRefreshToken,
            scope || null,
            expiresAtStr,
            userId,
            provider,
          ];
      db.prepare(updateSql).run(...params);
    } else {
      const id = crypto.randomUUID();
      const params = includeAccountEmail
        ? [
            id,
            userId,
            provider,
            encryptedAccessToken,
            encryptedRefreshToken,
            scope || null,
            expiresAtStr,
            nextAccountEmail,
          ]
        : [
            id,
            userId,
            provider,
            encryptedAccessToken,
            encryptedRefreshToken,
            scope || null,
            expiresAtStr,
          ];
      db.prepare(insertSql).run(...params);
    }

    return getOAuthCredential(userId, provider)!;
  };

  const isAccountEmailError = (error: unknown) =>
    error instanceof Error && /account_email/i.test(error.message);

  try {
    return run(true);
  } catch (error) {
    if (!isAccountEmailError(error)) {
      throw error;
    }

    try {
      db.exec("ALTER TABLE oauth_credentials ADD COLUMN account_email TEXT NULL");
      return run(true);
    } catch (alterError) {
      console.error('Failed to add account_email column on-demand:', alterError);
      return run(false);
    }
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

export async function getDecryptedOAuthCredential(userId: string, provider: 'google' | 'notion'): Promise<{
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  expiresAt?: Date;
  accountEmail?: string | null;
} | null> {
  const credential = getOAuthCredential(userId, provider);
  if (!credential) return null;
  
  try {
    return {
      accessToken: await decryptField(credential.access_token),
      refreshToken: credential.refresh_token ? await decryptField(credential.refresh_token) : undefined,
      scope: credential.scope || undefined,
      expiresAt: credential.expires_at ? new Date(credential.expires_at) : undefined,
      accountEmail: credential.account_email ?? null,
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

// Application settings helpers
interface AppSettingRow {
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

const GOOGLE_OAUTH_CONFIG_KEY = 'google_oauth_client';

function upsertAppSetting(key: string, encryptedValue: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO app_settings (key, value, created_at, updated_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);
  stmt.run(key, encryptedValue);
}

function getAppSettingRow(key: string): AppSettingRow | null {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT key, value, created_at, updated_at FROM app_settings WHERE key = ?');
    const row = stmt.get(key) as AppSettingRow | undefined;
    return row || null;
  } catch (error) {
    if (
      error instanceof Error &&
      (/no such table/i.test(error.message) || /unable to open database file/i.test(error.message))
    ) {
      return null;
    }
    throw error;
  }
}

function deleteAppSettingRow(key: string): void {
  try {
    const db = getDb();
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
  } catch (error) {
    if (
      error instanceof Error &&
      (/no such table/i.test(error.message) || /unable to open database file/i.test(error.message))
    ) {
      return;
    }
    throw error;
  }
}

export async function saveGoogleOAuthConfig(config: GoogleOAuthConfig): Promise<void> {
  const payload = JSON.stringify(config);
  const encrypted = await encryptField(payload);
  upsertAppSetting(GOOGLE_OAUTH_CONFIG_KEY, encrypted);
}

export async function getGoogleOAuthConfig(): Promise<GoogleOAuthConfig | null> {
  const row = getAppSettingRow(GOOGLE_OAUTH_CONFIG_KEY);
  if (!row) return null;
  try {
    const decrypted = await decryptField(row.value);
    return JSON.parse(decrypted) as GoogleOAuthConfig;
  } catch (error) {
    console.error('Failed to read Google OAuth config:', error);
    return null;
  }
}

export async function getGoogleOAuthConfigWithMeta(): Promise<{
  config: GoogleOAuthConfig;
  createdAt: string;
  updatedAt: string;
} | null> {
  const row = getAppSettingRow(GOOGLE_OAUTH_CONFIG_KEY);
  if (!row) return null;
  try {
    const decrypted = await decryptField(row.value);
    const config = JSON.parse(decrypted) as GoogleOAuthConfig;
    return {
      config,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
} catch (error) {
    console.error('Failed to parse Google OAuth config with metadata:', error);
    return null;
  }
}

export function deleteGoogleOAuthConfig(): void {
  deleteAppSettingRow(GOOGLE_OAUTH_CONFIG_KEY);
}

export interface GoogleOAuthConfigSummary {
  configured: boolean;
  source: 'database' | 'env' | null;
  clientId?: string;
  projectId?: string | null;
  updatedAt?: string | null;
  redirectUriCount?: number;
  canDelete?: boolean;
}

export async function getGoogleOAuthConfigSummary(): Promise<GoogleOAuthConfigSummary> {
  const stored = await getGoogleOAuthConfigWithMeta();
  if (stored) {
    return {
      configured: true,
      source: 'database',
      clientId: stored.config.clientId,
      projectId: stored.config.projectId ?? null,
      updatedAt: stored.updatedAt,
      redirectUriCount: Array.isArray(stored.config.redirectUris)
        ? stored.config.redirectUris.length
        : 0,
      canDelete: true,
    };
  }

  const envClientId = process.env.GOOGLE_CLIENT_ID;
  const envClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (envClientId && envClientSecret) {
    return {
      configured: true,
      source: 'env',
      clientId: envClientId,
      projectId: process.env.GOOGLE_PROJECT_ID ?? null,
      updatedAt: null,
      canDelete: false,
    };
  }

  return {
    configured: false,
    source: null,
    canDelete: false,
  };
}

export async function isGoogleOAuthConfigured(): Promise<boolean> {
  return (await getGoogleOAuthConfigSummary()).configured;
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
    'search_notion',
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

export interface AgentFile {
  id: string;
  agent_id: string;
  attachment_id: string;
  created_at: string;
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
    'search_notion',
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

// ─────────────────────────────────────────────────────────────────────────────
// Auth Sessions
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthSession {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
}

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createAuthSession(userId: string, tokenHash: string): AuthSession {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  const stmt = db.prepare(`
    INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, userId, tokenHash, now.toISOString(), expiresAt.toISOString());
  return { id, user_id: userId, token_hash: tokenHash, created_at: now.toISOString(), expires_at: expiresAt.toISOString() };
}

export function getAuthSessionByTokenHash(tokenHash: string): AuthSession | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM auth_sessions WHERE token_hash = ?');
  const row = stmt.get(tokenHash) as AuthSession | undefined;
  if (!row) return null;
  // Check expiry
  if (new Date(row.expires_at) < new Date()) {
    deleteAuthSession(row.id);
    return null;
  }
  return row;
}

export function deleteAuthSession(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(sessionId);
}

export function deleteAuthSessionsByUser(userId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
}

export function cleanExpiredSessions(): number {
  const db = getDb();
  const result = db.prepare('DELETE FROM auth_sessions WHERE expires_at < datetime(\'now\')').run();
  return result.changes;
}

// ─────────────────────────────────────────────────────────────────────────────
// First Login Completed Flag
// ─────────────────────────────────────────────────────────────────────────────

const FIRST_LOGIN_COMPLETED_KEY = 'first_login_completed';

export function isFirstLoginCompleted(): boolean {
  const row = getAppSettingRow(FIRST_LOGIN_COMPLETED_KEY);
  return row?.value === 'true';
}

export function setFirstLoginCompleted(): void {
  upsertAppSetting(FIRST_LOGIN_COMPLETED_KEY, 'true');
}
