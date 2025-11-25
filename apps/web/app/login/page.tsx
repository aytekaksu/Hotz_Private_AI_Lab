'use client';

import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { uploadWithProgress } from '@/lib/client/upload';

export const dynamic = 'force-dynamic';

interface AuthStatus {
  authenticated: boolean;
  user: { id: string; email: string } | null;
  firstLoginCompleted: boolean;
  googleClientConfigured: boolean;
  mfaPending?: boolean;
  totpEnabled?: boolean;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [redirectUri, setRedirectUri] = useState<string>('');

  const error = searchParams.get('error');

  const fetchAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      setAuthStatus(data);
      
      // If already authenticated, redirect to home
      if (data.authenticated) {
        router.replace('/');
      } else if (data.mfaPending) {
        router.replace('/login/two-factor');
      }
    } catch (err) {
      console.error('Failed to fetch auth status:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchAuthStatus();
  }, [fetchAuthStatus]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      setRedirectUri(`${origin}/api/auth/google/callback`);
    } else {
      const fallbackBase = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || process.env.NEXTAUTH_URL || '';
      if (fallbackBase) {
        const trimmed = fallbackBase.replace(/\/$/, '');
        setRedirectUri(`${trimmed}/api/auth/google/callback`);
      }
    }
  }, []);

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google?mode=login';
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFeedback(null);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const result = await uploadWithProgress<{ success?: boolean; error?: string }>(
        '/api/settings/google-credentials',
        formData,
        { onProgress: (percent) => setUploadProgress(percent) }
      );

      if (result?.error) {
        throw new Error(result.error);
      }

      setFeedback({ type: 'success', message: 'Google OAuth credentials saved successfully!' });
      await fetchAuthStatus();
    } catch (err) {
      console.error('Failed to upload credentials:', err);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to upload credentials',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      // Reset the input
      event.target.value = '';
    }
  };

  const getErrorMessage = (code: string | null): string | null => {
    switch (code) {
      case 'google_auth_failed':
        return 'Google authentication failed. Please try again.';
      case 'unauthorized_email':
        return 'This Google account is not authorized to access this application.';
      case 'email_not_available':
        return 'Could not retrieve email from Google account.';
      case 'google_client_not_configured':
        return 'Google OAuth is not configured. Please upload credentials first.';
      case 'google_token_exchange_failed':
        return 'Failed to complete authentication. Please try again.';
      case 'invalid_callback':
        return 'Invalid authentication callback.';
      default:
        return null;
    }
  };

  const errorMessage = getErrorMessage(error);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  // Only show first-time setup helpers until the very first successful login is completed
  const showFirstTimeSetup = !authStatus?.firstLoginCompleted;
  const canLogin = authStatus?.googleClientConfigured;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="grid w-full max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
        <div className="w-full">
          {/* Logo/Title */}
          <div className="mb-8 text-center md:text-left">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card/80 shadow-lg md:mx-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-8 w-8 text-accent">
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground">AI Assistant</h1>
            <p className="mt-2 text-sm text-muted">Private AI workspace</p>
          </div>

          {/* Main Card */}
          <div className="rounded-3xl border border-border bg-card/80 p-8 shadow-xl backdrop-blur">
            {/* Error Message */}
            {errorMessage && (
              <div className="mb-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {errorMessage}
              </div>
            )}

            {/* Credential Upload Section - Visible until first login completes */}
            {showFirstTimeSetup && (
              <div className="mb-6">
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                      <path
                        d="M10 6v4m0 4h.01M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Upload Google OAuth client
                  </h2>
                  <p className="mt-2 text-xs text-amber-300/80">
                    Upload your Google OAuth client credentials to enable login. You can get these from the{' '}
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-amber-200"
                    >
                      Google Cloud Console
                    </a>
                    .
                  </p>
                </div>

                <div className="mt-4">
                  <label
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface/50 p-6 transition hover:border-accent hover:bg-surface/80 ${
                      isUploading ? 'cursor-not-allowed opacity-60' : ''
                    }`}
                  >
                    <input
                      type="file"
                      className="hidden"
                      accept="application/json"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="mb-2 h-8 w-8 text-muted">
                      <path
                        d="M12 16V4m0 0L8 8m4-4l4 4M4 20h16"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="text-sm font-medium text-foreground">
                      {isUploading ? 'Uploading...' : 'Upload client_secret.json'}
                    </span>
                    <span className="mt-1 text-xs text-muted">Click to select file</span>
                  </label>

                  {isUploading && uploadProgress !== null && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-border/60">
                        <div
                          className="h-full bg-accent transition-[width]"
                          style={{ width: `${Math.max(uploadProgress, 5)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted">{uploadProgress}%</span>
                    </div>
                  )}

                  {feedback && (
                    <p
                      className={`mt-3 text-xs ${
                        feedback.type === 'error' ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {feedback.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Status Indicator */}
            {authStatus?.googleClientConfigured && (
              <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path
                    d="M5 10l4 4 6-8"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Google OAuth configured
              </div>
            )}

            {/* Login Button */}
            <button
              onClick={handleGoogleLogin}
              disabled={!canLogin}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {canLogin ? 'Sign in with Google' : 'Configure Google OAuth first'}
            </button>

            {!canLogin && (
              <p className="mt-4 text-center text-xs text-muted">
                Upload your Google OAuth credentials above to enable login.
              </p>
            )}
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-muted md:text-left">
            Single-user private workspace. Only the authorized Google account can access this app.
          </p>
        </div>

        {/* Instructions */}
        {showFirstTimeSetup && (
          <div className="rounded-3xl border border-border bg-card/70 p-6 shadow-lg backdrop-blur">
            <h2 className="text-lg font-semibold text-foreground">How to get your Google OAuth JSON</h2>
            <p className="mt-1 text-xs text-muted">
              Use these steps to create the client and download the JSON before uploading it here.
            </p>
            <ol className="mt-4 space-y-3 text-sm text-foreground">
              <li>1) Open <a className="underline" href="https://console.cloud.google.com" target="_blank" rel="noreferrer">Google Cloud Console</a>.</li>
              <li>2) Create a new project (e.g., “assistant”).</li>
              <li>3) Click “Get started” for OAuth consent.</li>
              <li>4) Enter an app name (e.g., “assistant”) and select your email for user support.</li>
              <li>5) Choose “External” as the audience (required for non-Workspace accounts).</li>
              <li>6) Enter your email again when prompted, then finish.</li>
              <li>7) Go to “Clients” in the left menu and click “Create client”.</li>
              <li>8) Select “Web application” as the application type.</li>
              <li>9) Name it (e.g., “assistant”).</li>
              <li>10) Add this redirect URI: <span className="break-all font-mono text-xs">{redirectUri || 'https://your-domain.com/api/auth/google/callback'}</span></li>
              <li>11) Click Create, then download the JSON from the popup.</li>
              <li>12) Open “Audience” on the left, add your Google email as a user, and save.</li>
              <li>13) Enable APIs: search and enable “Google Calendar API” and “Google Tasks API”.</li>
              <li>14) Upload the downloaded JSON file above on this page.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
