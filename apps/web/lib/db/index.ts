import Database from 'better-sqlite3';
import path from 'path';
import { encryptField, decryptField } from '../encryption';

// Database connection
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_URL?.replace('file://', '') || path.join(process.cwd(), 'data', 'app.db');
    
    // Ensure data directory exists
    const fs = require('fs');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    db = new Database(dbPath);
    
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache
    db.pragma('temp_store = MEMORY');
    
    console.log(`Database initialized at ${dbPath}`);
  }
  
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// User operations
export interface User {
  id: string;
  email: string;
  openrouter_api_key?: string;
  google_oauth_token?: string;
  google_refresh_token?: string;
  notion_oauth_token?: string;
  notion_refresh_token?: string;
  created_at: string;
  updated_at: string;
}

export function createUser(email: string): User {
  const database = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const stmt = database.prepare(`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(id, email, now, now);
  
  return {
    id,
    email,
    created_at: now,
    updated_at: now,
  };
}

export function getUserByEmail(email: string): User | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM users WHERE email = ?');
  const user = stmt.get(email) as User | undefined;
  
  if (!user) return null;
  
  // Decrypt sensitive fields
  if (user.openrouter_api_key) {
    try {
      user.openrouter_api_key = decryptField(user.openrouter_api_key);
    } catch (e) {
      console.error('Failed to decrypt OpenRouter API key');
    }
  }
  
  if (user.google_oauth_token) {
    try {
      user.google_oauth_token = decryptField(user.google_oauth_token);
    } catch (e) {
      console.error('Failed to decrypt Google OAuth token');
    }
  }
  
  if (user.google_refresh_token) {
    try {
      user.google_refresh_token = decryptField(user.google_refresh_token);
    } catch (e) {
      console.error('Failed to decrypt Google refresh token');
    }
  }
  
  if (user.notion_oauth_token) {
    try {
      user.notion_oauth_token = decryptField(user.notion_oauth_token);
    } catch (e) {
      console.error('Failed to decrypt Notion OAuth token');
    }
  }
  
  if (user.notion_refresh_token) {
    try {
      user.notion_refresh_token = decryptField(user.notion_refresh_token);
    } catch (e) {
      console.error('Failed to decrypt Notion refresh token');
    }
  }
  
  return user;
}

export function getUserById(id: string): User | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM users WHERE id = ?');
  const user = stmt.get(id) as User | undefined;
  
  if (!user) return null;
  
  // Decrypt sensitive fields (same as getUserByEmail)
  if (user.openrouter_api_key) {
    try {
      user.openrouter_api_key = decryptField(user.openrouter_api_key);
    } catch (e) {
      console.error('Failed to decrypt OpenRouter API key');
    }
  }
  
  return user;
}

export function updateUserOpenRouterKey(userId: string, apiKey: string): void {
  const database = getDb();
  const encrypted = encryptField(apiKey);
  const now = new Date().toISOString();
  
  const stmt = database.prepare(`
    UPDATE users
    SET openrouter_api_key = ?, updated_at = ?
    WHERE id = ?
  `);
  
  stmt.run(encrypted, now, userId);
}

export function updateUserGoogleTokens(
  userId: string,
  accessToken: string,
  refreshToken: string
): void {
  const database = getDb();
  const encryptedAccess = encryptField(accessToken);
  const encryptedRefresh = encryptField(refreshToken);
  const now = new Date().toISOString();
  
  const stmt = database.prepare(`
    UPDATE users
    SET google_oauth_token = ?, google_refresh_token = ?, updated_at = ?
    WHERE id = ?
  `);
  
  stmt.run(encryptedAccess, encryptedRefresh, now, userId);
}

export function updateUserNotionToken(userId: string, accessToken: string): void {
  const database = getDb();
  const encrypted = encryptField(accessToken);
  const now = new Date().toISOString();
  
  const stmt = database.prepare(`
    UPDATE users
    SET notion_oauth_token = ?, updated_at = ?
    WHERE id = ?
  `);
  
  stmt.run(encrypted, now, userId);
}

// Conversation operations
export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function createConversation(userId: string, title: string = 'New Conversation'): Conversation {
  const database = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const stmt = database.prepare(`
    INSERT INTO conversations (id, user_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, userId, title, now, now);
  
  return { id, user_id: userId, title, created_at: now, updated_at: now };
}

export function getConversationsByUserId(userId: string): Conversation[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM conversations
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `);
  
  return stmt.all(userId) as Conversation[];
}

export function getConversationById(conversationId: string): Conversation | null {
  const database = getDb();
  const stmt = database.prepare('SELECT * FROM conversations WHERE id = ?');
  return stmt.get(conversationId) as Conversation | null;
}

export function deleteConversation(conversationId: string): void {
  const database = getDb();
  
  // Delete messages first (foreign key constraint)
  const deleteMessages = database.prepare('DELETE FROM messages WHERE conversation_id = ?');
  deleteMessages.run(conversationId);
  
  // Delete conversation
  const deleteConv = database.prepare('DELETE FROM conversations WHERE id = ?');
  deleteConv.run(conversationId);
}

export function updateConversationTitle(conversationId: string, title: string): void {
  const database = getDb();
  const now = new Date().toISOString();
  
  const stmt = database.prepare(`
    UPDATE conversations
    SET title = ?, updated_at = ?
    WHERE id = ?
  `);
  
  stmt.run(title, now, conversationId);
}

// Message operations
export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: string; // JSON string
  token_count?: number;
  created_at: string;
}

export function createMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  toolCalls?: any,
  tokenCount?: number
): Message {
  const database = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const toolCallsJson = toolCalls ? JSON.stringify(toolCalls) : null;
  
  const stmt = database.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, tool_calls, token_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, conversationId, role, content, toolCallsJson, tokenCount || null, now);
  
  return {
    id,
    conversation_id: conversationId,
    role,
    content,
    tool_calls: toolCallsJson || undefined,
    token_count: tokenCount,
    created_at: now,
  };
}

export function getMessagesByConversationId(conversationId: string): Message[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `);
  
  return stmt.all(conversationId) as Message[];
}


