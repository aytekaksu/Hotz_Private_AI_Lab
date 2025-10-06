import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Status endpoint - provides detailed system information
 */
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    
    // Get user count
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    
    // Get conversation count
    const convCount = db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number };
    
    // Get message count
    const msgCount = db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
    
    // Get recent activity (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentConvs = db.prepare(
      'SELECT COUNT(*) as count FROM conversations WHERE created_at > ?'
    ).get(yesterday) as { count: number };
    
    const recentMsgs = db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE created_at > ?'
    ).get(yesterday) as { count: number };
    
    return Response.json({
      status: 'operational',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        type: 'SQLite',
        users: userCount.count,
        conversations: convCount.count,
        messages: msgCount.count,
      },
      activity_24h: {
        new_conversations: recentConvs.count,
        new_messages: recentMsgs.count,
      },
      features: {
        openrouter: !!process.env.APP_ENCRYPTION_KEY,
        google_oauth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        notion_oauth: !!(process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET),
        n8n_integration: !!process.env.N8N_WEBHOOK_URL,
      },
    });
  } catch (error) {
    console.error('Status endpoint error:', error);
    return Response.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}


