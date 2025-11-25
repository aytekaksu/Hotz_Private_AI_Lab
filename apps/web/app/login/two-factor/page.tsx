'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type TotpStatus = {
  authenticated: boolean;
  mfaPending: boolean;
  totpEnabled: boolean;
  user: { id: string; email: string } | null;
};

type SetupPayload = {
  secret: string;
  issuer: string;
  label: string;
  otpauthUrl: string;
  qrDataUrl: string;
};

const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(url, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message = typeof data?.error === 'string' ? data.error : 'Request failed';
    throw new Error(message);
  }
  return res.json() as Promise<T>;
};

export default function TwoFactorPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const desiredMode = search.get('mode'); // setup | verify

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<TotpStatus>('/api/auth/totp/status');
      setStatus(data);
      if (data.authenticated) {
        router.replace('/');
        return;
      }
      if (!data.mfaPending) {
        router.replace('/login');
        return;
      }
      if (!data.totpEnabled) {
        await loadSetupPayload();
      }
    } catch (err) {
      console.error('Failed to load TOTP status', err);
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  };

  const loadSetupPayload = async () => {
    try {
      const payload = await fetchJson<SetupPayload>('/api/auth/totp/setup', { method: 'POST' });
      setSetup(payload);
    } catch (err) {
      console.error('Failed to prepare TOTP setup', err);
      setError(err instanceof Error ? err.message : 'Could not start TOTP setup');
    }
  };

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mode: 'setup' | 'verify' = useMemo(() => {
    if (status?.totpEnabled) return 'verify';
    if (desiredMode === 'setup' || desiredMode === 'verify') return desiredMode;
    return 'setup';
  }, [desiredMode, status?.totpEnabled]);

  const userEmail = status?.user?.email ?? 'your account';

  const handleVerify = async () => {
    setVerifying(true);
    setError(null);
    setInfo(null);
    try {
      const trimmed = code.replace(/\s+/g, '');
      if (!trimmed) {
        throw new Error('Enter the 6-digit code from your authenticator app.');
      }
      await fetchJson('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      setInfo('Success! Redirecting...');
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted shadow">
          Checking authentication…
        </div>
      </div>
    );
  }

  if (!status?.mfaPending) {
    return null;
  }

  const heading =
    mode === 'setup'
      ? 'Set up two-factor authentication'
      : 'Enter your 6-digit code';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background via-background to-background/60 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card/80 shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-8 w-8 text-accent">
              <path
                d="M12 2 2 7l10 5 10-5-10-5Z"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 12l10 5 10-5"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{heading}</h1>
          <p className="mt-2 text-sm text-muted">
            {mode === 'setup'
              ? `Secure access for ${userEmail} with an authenticator app.`
              : `Enter the code from your authenticator app for ${userEmail}.`}
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card/80 p-8 shadow-xl backdrop-blur">
          {mode === 'setup' && (
            <div className="mb-6 space-y-4">
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
                <h2 className="text-sm font-semibold text-amber-300">Step 1 — Scan or enter the key</h2>
                <p className="mt-1 text-xs text-amber-200/80">
                  Use Google Authenticator, 1Password, Authy, or any TOTP app. If scanning fails, manually enter the
                  key below.
                </p>
              </div>

              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface/70 p-4 sm:flex-row">
                {setup?.qrDataUrl ? (
                  <img
                    src={setup.qrDataUrl}
                    alt="TOTP QR Code"
                    className="h-32 w-32 rounded-lg border border-border shadow-sm"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">
                    QR loading…
                  </div>
                )}
                <div className="w-full space-y-2 text-sm">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Account</span>
                    <span className="font-medium text-foreground">{setup?.label || userEmail}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Issuer</span>
                    <span className="font-medium text-foreground">{setup?.issuer || 'AI Assistant'}</span>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Manual key</p>
                    <div className="mt-1 rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-sm tracking-wide text-foreground">
                      {setup?.secret || 'Loading…'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface/70 p-4">
                <p className="text-sm font-semibold text-foreground">Step 2 — Enter a 6-digit code to confirm</p>
                <p className="mt-1 text-xs text-muted">
                  We’ll verify the code before turning on two-factor authentication.
                </p>
              </div>
            </div>
          )}

          {mode === 'verify' && (
            <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path d="M5 10l3 3 7-7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Two-factor is enabled. Enter your current 6-digit code to continue.
              </div>
            </div>
          )}

          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">6-digit code</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-lg tracking-[0.35em] text-center font-semibold text-foreground outline-none ring-0 transition focus:border-accent focus:shadow-[0_0_0_2px_rgba(99,102,241,0.2)]"
              placeholder="••••••"
              maxLength={10}
            />

            <button
              onClick={handleVerify}
              disabled={verifying}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-foreground shadow-lg shadow-accent/20 transition hover:shadow-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verifying ? 'Verifying…' : 'Verify & continue'}
            </button>

            {error && <p className="text-sm text-red-400">{error}</p>}
            {info && <p className="text-sm text-emerald-400">{info}</p>}

            <p className="mt-2 text-xs text-muted">
              Lost access to your authenticator? You’ll need console access to reset TOTP for this account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
