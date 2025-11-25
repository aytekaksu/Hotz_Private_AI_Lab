import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = 'auth_session';

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/google',
  '/api/auth/google/callback',
  '/api/auth/me',
  '/api/auth/logout',
  '/api/health',
  '/api/status',
  '/api/settings/google-credentials', // Needed for first-time setup
];

// Paths that should be accessible without auth (static assets, etc.)
const STATIC_PREFIXES = [
  '/_next',
  '/favicon',
  '/static',
  '/images',
  '/fonts',
];

function isPublicPath(pathname: string): boolean {
  // Check exact matches
  if (PUBLIC_PATHS.includes(pathname)) {
    return true;
  }
  
  // Check prefixes for static assets
  for (const prefix of STATIC_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return true;
    }
  }
  
  // Check if it's the google auth routes with query params
  if (pathname.startsWith('/api/auth/google')) {
    return true;
  }
  
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
  
  // Allow public paths
  if (isPublicPath(pathname)) {
    // If user is authenticated and tries to access login, redirect to home
    if (pathname === '/login' && hasSessionCookie) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }
  
  // Check for session cookie
  if (!hasSessionCookie) {
    // For API routes, return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    // For page routes, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // Handle root redirect to forward page
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/forward', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

