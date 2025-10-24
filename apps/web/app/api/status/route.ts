import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Status endpoint - provides detailed system information
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    
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
    
    // Check user OAuth connections if userId provided
    let googleConnected = false;
    let googleEmail: string | null = null;
    let notionConnected = false;
    
    if (userId) {
      try {
        try {
          const googleCred = db.prepare(
            'SELECT id, account_email FROM oauth_credentials WHERE user_id = ? AND provider = ?'
          ).get(userId, 'google');
          if (googleCred) {
            googleConnected = true;
            if (typeof (googleCred as any).account_email === 'string') {
              googleEmail = (googleCred as any).account_email;
            }
          }
        } catch (innerError) {
          const legacyGoogleCred = db
            .prepare('SELECT id FROM oauth_credentials WHERE user_id = ? AND provider = ?')
            .get(userId, 'google');
          googleConnected = !!legacyGoogleCred;
        }
        
        const notionCred = db.prepare(
          'SELECT id FROM oauth_credentials WHERE user_id = ? AND provider = ?'
        ).get(userId, 'notion');
        notionConnected = !!notionCred;
      } catch (e) {
        // Ignore errors checking user credentials
      }
    }
    
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
      },
      google_connected: googleConnected,
      notion_connected: notionConnected,
      google_email: googleEmail,
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
