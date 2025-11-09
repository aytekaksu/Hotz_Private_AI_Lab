'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
// Theme toggle removed — app is permanently dark

const MASK_PREFIX = '••••••••••';
const formatKeyPreview = (suffix: string | null) => `${MASK_PREFIX}${suffix ?? '??????????'}`;

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [isRemovingKey, setIsRemovingKey] = useState(false);
  const [openRouterSuffix, setOpenRouterSuffix] = useState<string | null>(null);
  const [openRouterDisplay, setOpenRouterDisplay] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [isSavingAnthKey, setIsSavingAnthKey] = useState(false);
  const [anthKeySaved, setAnthKeySaved] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [isRemovingAnthKey, setIsRemovingAnthKey] = useState(false);
  const [anthropicSuffix, setAnthropicSuffix] = useState<string | null>(null);
  const [anthropicDisplay, setAnthropicDisplay] = useState('');
  const [googleConnected, setGoogleConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [hasNotionSecret, setHasNotionSecret] = useState(false);
  const [notionSecretDisplay, setNotionSecretDisplay] = useState('');
  const [notionSecret, setNotionSecret] = useState('');
  const [isSavingNotionSecret, setIsSavingNotionSecret] = useState(false);
  const [notionSecretSaved, setNotionSecretSaved] = useState(false);
  const [isRemovingNotionSecret, setIsRemovingNotionSecret] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleClientConfigured, setGoogleClientConfigured] = useState(false);
  const [googleClientSource, setGoogleClientSource] = useState<'database' | 'env' | null>(null);
  const [googleClientIdSuffix, setGoogleClientIdSuffix] = useState<string | null>(null);
  const [googleClientProjectId, setGoogleClientProjectId] = useState<string | null>(null);
  const [googleClientUpdatedAt, setGoogleClientUpdatedAt] = useState<string | null>(null);
  const [isUploadingGoogleClient, setIsUploadingGoogleClient] = useState(false);
  const [isRemovingGoogleClient, setIsRemovingGoogleClient] = useState(false);
  const [googleClientFeedback, setGoogleClientFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState('anthropic/claude-haiku-4.5');
  const [routingVariant, setRoutingVariant] = useState<'floor' | 'nitro' | ''>('floor');
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);
  const [provider, setProvider] = useState<'openrouter' | 'anthropic'>('openrouter');

  const fetchGoogleClientConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/google-credentials');
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }
      const data = await response.json();
      setGoogleClientConfigured(!!data?.configured);
      setGoogleClientSource(
        data?.source === 'database' || data?.source === 'env' ? data.source : null,
      );
      setGoogleClientIdSuffix(typeof data?.clientIdSuffix === 'string' ? data.clientIdSuffix : null);
      setGoogleClientProjectId(typeof data?.projectId === 'string' ? data.projectId : null);
      setGoogleClientUpdatedAt(typeof data?.updatedAt === 'string' ? data.updatedAt : null);
    } catch (error) {
      console.warn('Failed to load Google OAuth client configuration:', error);
      setGoogleClientConfigured(false);
      setGoogleClientSource(null);
      setGoogleClientIdSuffix(null);
      setGoogleClientProjectId(null);
      setGoogleClientUpdatedAt(null);
    }
  }, []);

  const loadSettings = useCallback(async (uid: string) => {
    setIsLoading(true);
    await fetchGoogleClientConfig();
    let notionSecretConfigured = false;
    try {
      const response = await fetch(`/api/settings/openrouter-key?userId=${uid}`);
      const data = await response.json();
      if (data.hasKey) {
        const suffix = typeof data.keySuffix === 'string' ? data.keySuffix : null;
        setHasExistingKey(true);
        setOpenRouterSuffix(suffix);
        setOpenRouterDisplay(formatKeyPreview(suffix));
      } else {
        setHasExistingKey(false);
        setOpenRouterSuffix(null);
        setOpenRouterDisplay('');
      }
      setOpenRouterKey('');

      let anthropicKeyPresent = false;
      try {
        const aRes = await fetch(`/api/settings/anthropic-key?userId=${uid}`);
        const aData = await aRes.json();
        if (aData.hasKey) {
          anthropicKeyPresent = true;
          const suffix = typeof aData.keySuffix === 'string' ? aData.keySuffix : null;
          setAnthropicSuffix(suffix);
          setAnthropicDisplay(formatKeyPreview(suffix));
          setHasAnthropicKey(true);
        } else {
          anthropicKeyPresent = false;
          setAnthropicSuffix(null);
          setAnthropicDisplay('');
          setHasAnthropicKey(false);
        }
        setAnthropicKey('');
      } catch (error) {
        console.warn('Failed to load Anthropic key state:', error);
      }

      try {
        const modelRes = await fetch(`/api/settings/default-model?userId=${uid}`);
        if (modelRes.ok) {
          const m = await modelRes.json();
          const allowedModels = ['anthropic/claude-sonnet-4.5', 'anthropic/claude-haiku-4.5'];
          setDefaultModel(allowedModels.includes(m.model) ? m.model : 'anthropic/claude-haiku-4.5');
          const rv = (m.routingVariant || 'floor').toLowerCase();
          setRoutingVariant(rv === 'nitro' ? 'nitro' : rv === '' ? '' : 'floor');
        }
      } catch (error) {
        console.warn('Failed to load default model:', error);
      }

      try {
        const providerRes = await fetch(`/api/settings/provider?userId=${uid}`);
        if (providerRes.ok) {
          const p = await providerRes.json();
          if (p.provider === 'anthropic' && !anthropicKeyPresent) {
            setProvider('openrouter');
          } else {
            setProvider(p.provider === 'anthropic' ? 'anthropic' : 'openrouter');
          }
        }
      } catch (error) {
        console.warn('Failed to load provider preference:', error);
      }

      try {
        const notionRes = await fetch(`/api/settings/notion-secret?userId=${uid}`);
        if (notionRes.ok) {
          const notionData = await notionRes.json();
          notionSecretConfigured = !!notionData.hasSecret;
          if (notionSecretConfigured) {
            const suffix = typeof notionData.secretSuffix === 'string' ? notionData.secretSuffix : null;
            setHasNotionSecret(true);
            setNotionSecretDisplay(formatKeyPreview(suffix));
          } else {
            setHasNotionSecret(false);
            setNotionSecretDisplay('');
          }
        } else {
          notionSecretConfigured = false;
          setHasNotionSecret(false);
          setNotionSecretDisplay('');
        }
      } catch (error) {
        console.warn('Failed to load Notion integration state:', error);
        notionSecretConfigured = false;
        setHasNotionSecret(false);
        setNotionSecretDisplay('');
      }
      setNotionSecret('');
      setNotionConnected(notionSecretConfigured);

      const statusResponse = await fetch(`/api/status?userId=${uid}`);
      const statusData = await statusResponse.json();
      setNotionConnected(prev => prev || statusData.notion_connected || false);

      try {
        const googleStatusRes = await fetch(`/api/settings/google-connection?userId=${uid}`);
        if (googleStatusRes.ok) {
          const googleData = await googleStatusRes.json();
          setGoogleConnected(!!googleData.connected);
          setGoogleEmail(typeof googleData.email === 'string' ? googleData.email : null);
          if (typeof googleData.clientConfigured === 'boolean') {
            setGoogleClientConfigured(googleData.clientConfigured);
          }
          if (googleData.configSource === 'database' || googleData.configSource === 'env') {
            setGoogleClientSource(googleData.configSource);
          }
          if (typeof googleData.clientIdSuffix === 'string') {
            setGoogleClientIdSuffix(googleData.clientIdSuffix);
          }
        } else {
          setGoogleConnected(statusData.google_connected || false);
          setGoogleEmail(typeof statusData.google_email === 'string' ? statusData.google_email : null);
        }
      } catch (error) {
        console.warn('Failed to load Google connection state:', error);
        setGoogleConnected(statusData.google_connected || false);
        setGoogleEmail(typeof statusData.google_email === 'string' ? statusData.google_email : null);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchGoogleClientConfig]);

  useEffect(() => {
    const initSettings = async () => {
      setInitError(null);
      setIsLoading(true);

      const createDefaultUser = async (): Promise<string | null> => {
        try {
          const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'user@assistant.local' }),
          });

          if (!response.ok) {
            console.error('Failed to create default user:', response.statusText);
            return null;
          }

          const data = await response.json();
          const newUserId = typeof data.user?.id === 'string' ? data.user.id : null;
          if (newUserId) {
            localStorage.setItem('userId', newUserId);
          }
          return newUserId;
        } catch (error) {
          console.error('Failed to create default user:', error);
          return null;
        }
      };

      let storedUserId: string | null = null;
      try {
        storedUserId = localStorage.getItem('userId');
      } catch (error) {
        console.error('Unable to access localStorage:', error);
      }

      let userId = storedUserId;

      if (!userId) {
        userId = await createDefaultUser();
      } else {
        try {
          const response = await fetch(`/api/users/${userId}`);
          if (!response.ok) {
            localStorage.removeItem('userId');
            userId = await createDefaultUser();
          }
        } catch (error) {
          console.error('Error verifying user:', error);
          localStorage.removeItem('userId');
          userId = await createDefaultUser();
        }
      }

      if (!userId) {
        setInitError('Unable to initialize the workspace. Please reload the page.');
        setIsLoading(false);
        return;
      }

      setUserId(userId);
      await loadSettings(userId);
    };

    initSettings();
  }, [loadSettings]);

  const saveOpenRouterKey = async () => {
    if (hasExistingKey) return;
    const plaintextKey = openRouterKey.trim();
    if (!plaintextKey) return;
    setIsSavingKey(true);
    setKeySaved(false);

    try {
      const response = await fetch('/api/settings/openrouter-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, apiKey: plaintextKey }),
      });

      let result: any = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (response.ok) {
        const suffix =
          (result && typeof result.keySuffix === 'string'
            ? result.keySuffix
            : plaintextKey.slice(-10));
        setKeySaved(true);
        setOpenRouterSuffix(suffix);
        setOpenRouterDisplay(formatKeyPreview(suffix));
        setHasExistingKey(true);
        setOpenRouterKey('');
        setTimeout(() => setKeySaved(false), 3000);
      } else {
        alert(`Failed to save API key: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to save API key:', error);
      alert('Failed to save API key');
    } finally {
      setIsSavingKey(false);
    }
  };

  const removeOpenRouterKey = async () => {
    if (!confirm('Remove your OpenRouter API key? This will disable AI functionality.')) return;
    setIsRemovingKey(true);

    try {
      const response = await fetch('/api/settings/openrouter-key', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        setOpenRouterKey('');
        setOpenRouterSuffix(null);
        setOpenRouterDisplay('');
        setHasExistingKey(false);
        setKeySaved(false);
      } else {
        const errorData = await response.json();
        alert(`Failed to remove API key: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to remove API key:', error);
      alert('Failed to remove API key');
    } finally {
      setIsRemovingKey(false);
    }
  };

  const saveAnthropicKey = async () => {
    if (hasAnthropicKey) return;
    const plaintextKey = anthropicKey.trim();
    if (!plaintextKey) return;
    setIsSavingAnthKey(true);
    setAnthKeySaved(false);

    try {
      const response = await fetch('/api/settings/anthropic-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, apiKey: plaintextKey }),
      });

      let result: any = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (response.ok) {
        const suffix =
          (result && typeof result.keySuffix === 'string'
            ? result.keySuffix
            : plaintextKey.slice(-10));
        setAnthKeySaved(true);
        setAnthropicSuffix(suffix);
        setAnthropicDisplay(formatKeyPreview(suffix));
        setAnthropicKey('');
        setHasAnthropicKey(true);
        setTimeout(() => setAnthKeySaved(false), 3000);
      } else {
        alert(`Failed to save API key: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to save Anthropic key:', error);
      alert('Failed to save API key');
    } finally {
      setIsSavingAnthKey(false);
    }
  };

  const removeAnthropicKey = async () => {
    if (!confirm('Remove your Anthropic API key?')) return;
    setIsRemovingAnthKey(true);

    try {
      const response = await fetch('/api/settings/anthropic-key', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        setAnthropicKey('');
        setAnthropicSuffix(null);
        setAnthropicDisplay('');
        setHasAnthropicKey(false);
        setAnthKeySaved(false);
        setProvider('openrouter');
        await fetch('/api/settings/provider', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, provider: 'openrouter' }),
        });
      } else {
        const errorData = await response.json();
        alert(`Failed to remove API key: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to remove Anthropic key:', error);
      alert('Failed to remove API key');
    } finally {
      setIsRemovingAnthKey(false);
    }
  };

  const saveDefaultModel = async () => {
    if (!defaultModel) return;
    setIsSavingModel(true);
    setModelSaved(false);
    try {
      const response = await fetch('/api/settings/default-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, model: defaultModel, routingVariant }),
      });
      if (response.ok) {
        setModelSaved(true);
        setTimeout(() => setModelSaved(false), 3000);
      } else {
        const errorData = await response.json();
        alert(`Failed to save model: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to save default model:', error);
      alert('Failed to save default model');
    } finally {
      setIsSavingModel(false);
    }
  };

  const saveProvider = async (prov: 'openrouter' | 'anthropic') => {
    if (prov === 'anthropic' && !hasAnthropicKey) {
      alert('Add your Anthropic API key first.');
      setProvider('openrouter');
      return;
    }
    setProvider(prov);
    try {
      await fetch('/api/settings/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, provider: prov }),
      });
    } catch (error) {
      console.error('Failed to save provider preference:', error);
      alert('Failed to save provider preference');
    }
  };

  const connectGoogle = () => {
    if (!googleClientConfigured) {
      setGoogleClientFeedback({ type: 'error', message: 'Upload Google client credentials first' });
      setTimeout(() => setGoogleClientFeedback(null), 4000);
      return;
    }
    window.location.href = `/api/auth/google?userId=${userId}`;
  };

  const disconnectGoogle = async () => {
    if (!confirm('Disconnect Google? Calendar and Tasks features will be disabled.')) return;
    try {
      const response = await fetch(`/api/auth/google?userId=${userId}`, { method: 'DELETE' });
      if (response.ok) {
        setGoogleConnected(false);
        setGoogleEmail(null);
        alert('Google disconnected successfully');
      } else {
        throw new Error('Failed to disconnect');
      }
    } catch (error) {
      console.error('Failed to disconnect Google:', error);
      alert('Failed to disconnect Google account');
    }
  };

  const reconnectGoogle = () => {
    if (confirm('Reconnect your Google account? This replaces the current connection.')) {
      connectGoogle();
    }
  };

  const uploadGoogleClientFile = async (file: File) => {
    setGoogleClientFeedback(null);
    setIsUploadingGoogleClient(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/settings/google-credentials', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to save Google credentials');
      }
      setGoogleClientFeedback({ type: 'success', message: 'Google OAuth client saved ✓' });
      setTimeout(() => setGoogleClientFeedback(null), 4000);
      await fetchGoogleClientConfig();
    } catch (error) {
      console.error('Failed to upload Google client secret JSON:', error);
      setGoogleClientFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to upload Google credentials',
      });
    } finally {
      setIsUploadingGoogleClient(false);
    }
  };

  const handleGoogleClientFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadGoogleClientFile(file);
    }
    event.target.value = '';
  };

  const removeGoogleClientCredentials = async () => {
    if (googleClientSource === 'env') {
      setGoogleClientFeedback({
        type: 'error',
        message: 'Google OAuth client is configured via environment variables and cannot be removed here.',
      });
      setTimeout(() => setGoogleClientFeedback(null), 4000);
      return;
    }

    if (!googleClientConfigured) {
      return;
    }

    if (!confirm('Remove the stored Google OAuth client credentials? Existing connections will stop working until new credentials are uploaded.')) {
      return;
    }

    setGoogleClientFeedback(null);
    setIsRemovingGoogleClient(true);
    try {
      const response = await fetch('/api/settings/google-credentials', { method: 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to remove Google credentials');
      }
      setGoogleClientFeedback({ type: 'success', message: 'Google OAuth client removed' });
      setTimeout(() => setGoogleClientFeedback(null), 4000);
      await fetchGoogleClientConfig();
    } catch (error) {
      console.error('Failed to delete Google credentials:', error);
      setGoogleClientFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to remove Google credentials',
      });
    } finally {
      setIsRemovingGoogleClient(false);
    }
  };

  const saveNotionSecret = async () => {
    const secret = notionSecret.trim();
    if (!secret || isSavingNotionSecret || !userId) return;
    setIsSavingNotionSecret(true);
    setNotionSecretSaved(false);

    try {
      const response = await fetch('/api/settings/notion-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, secret }),
      });

      let result: any = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (response.ok) {
        const suffix =
          (result && typeof result.secretSuffix === 'string'
            ? result.secretSuffix
            : secret.slice(-6));
        setHasNotionSecret(true);
        setNotionSecretDisplay(formatKeyPreview(suffix));
        setNotionSecret('');
        setNotionConnected(true);
        setNotionSecretSaved(true);
        setTimeout(() => setNotionSecretSaved(false), 3000);
      } else {
        alert(`Failed to save Notion integration secret: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to save Notion integration secret:', error);
      alert('Failed to save Notion integration secret');
    } finally {
      setIsSavingNotionSecret(false);
    }
  };

  const removeNotionSecret = async () => {
    if (!userId) return;
    if (!hasNotionSecret) {
      setNotionSecret('');
      setNotionSecretDisplay('');
      return;
    }
    if (!confirm('Remove the Notion integration secret? Notion tools will be disabled.')) return;
    setIsRemovingNotionSecret(true);
    try {
      const response = await fetch('/api/settings/notion-secret', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to remove secret');
      }

      setHasNotionSecret(false);
      setNotionSecretDisplay('');
      setNotionSecret('');
      setNotionConnected(false);
    } catch (error) {
      console.error('Failed to disconnect Notion:', error);
      alert('Failed to remove Notion integration secret');
    } finally {
      setIsRemovingNotionSecret(false);
    }
  };

  const openRouterEnabled = provider === 'openrouter';
  const anthropicEnabled = provider === 'anthropic';
  const notionSaveLabel = hasNotionSecret ? 'Update secret' : 'Save secret';
  const notionSaveButtonText = isSavingNotionSecret ? 'Saving…' : notionSaveLabel;
  const notionRemoveButtonText = isRemovingNotionSecret ? 'Removing…' : 'Remove secret';
  const googleClientReadOnly = googleClientSource === 'env';
  const formattedGoogleClientUpdatedAt = googleClientUpdatedAt
    ? new Date(googleClientUpdatedAt).toLocaleString()
    : null;

  if (initError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-muted">
        <p className="mb-4 max-w-md text-center text-sm text-foreground/80">{initError}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg"
          >
            Reload page
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="rounded-full border border-border px-4 py-2 text-sm text-foreground/80 transition hover:text-foreground"
          >
            Back to chat
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-12 md:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
          <div className="min-w-0 flex-1">
            <div className="mt-2 flex items-center">
              <button
                onClick={() => router.push('/')}
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-base text-foreground/85 transition hover:bg-card/70 hover:text-foreground"
                aria-label="Back to home"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-5 w-5">
                  <path d="M3 9.5 10 3l7 6.5M6 17v-5h8v5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back to home
              </button>
            </div>
            <h1 className="mt-3 truncate text-2xl font-semibold">Settings</h1>
            <p className="mt-2 text-sm text-muted">Manage API keys, connected services, and workspace preferences.</p>
          </div>
          {/* Theme toggle removed */}
        </header>

        <div className="mt-10 flex flex-col gap-6">
          <section className="rounded-3xl border border-border bg-card/90 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Connected Services</h2>
                <p className="mt-1 text-xs text-muted">Manage Google Workspace and Notion integrations.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Google Workspace</p>
                    <p className="text-xs text-muted">Calendar and Tasks integrations</p>
                  </div>
                  {googleConnected ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-border px-3 py-1 text-xs font-medium text-muted">
                      Not connected
                    </span>
                  )}
                </div>
                {googleConnected && googleEmail && (
                  <p className="mt-3 text-xs text-muted">
                    Connected as <span className="font-mono text-foreground">{googleEmail}</span>
                  </p>
                )}
                {!googleClientConfigured && (
                  <p className="mt-3 text-xs text-amber-500">
                    Upload your Google client_secret.json to enable workspace authentication.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {googleConnected ? (
                    <>
                      <button
                        type="button"
                        onClick={reconnectGoogle}
                        disabled={!googleClientConfigured}
                        title={!googleClientConfigured ? 'Upload Google client credentials first' : undefined}
                        className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reconnect
                      </button>
                      <button
                        type="button"
                        onClick={disconnectGoogle}
                        className="text-sm text-muted transition hover:text-red-400"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={connectGoogle}
                      disabled={!googleClientConfigured || isUploadingGoogleClient}
                      title={!googleClientConfigured ? 'Upload Google client credentials first' : undefined}
                      className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Connect Google
                    </button>
                  )}
                </div>
                <div className="mt-5 rounded-xl border border-border/60 bg-background/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted">OAuth client</p>
                      <p className="mt-1 text-sm text-foreground">
                        {googleClientConfigured ? 'Credentials on file' : 'Not configured'}
                      </p>
                    </div>
                    {googleClientIdSuffix && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] text-muted">
                        Client •••{googleClientIdSuffix}
                      </span>
                    )}
                  </div>
                  {googleClientProjectId && (
                    <p className="mt-2 text-xs text-muted">
                      Project ID:{' '}
                      <span className="font-mono text-foreground">{googleClientProjectId}</span>
                    </p>
                  )}
                  {formattedGoogleClientUpdatedAt && (
                    <p className="mt-1 text-xs text-muted">Updated {formattedGoogleClientUpdatedAt}</p>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    Source:{' '}
                    {googleClientReadOnly
                      ? 'environment variables'
                      : googleClientConfigured
                      ? 'encrypted in database'
                      : 'not configured'}
                  </p>
                  {googleClientFeedback && (
                    <p
                      className={`mt-2 text-xs ${
                        googleClientFeedback.type === 'error' ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {googleClientFeedback.message}
                    </p>
                  )}
                  {googleClientReadOnly && (
                    <p className="mt-2 text-xs text-muted">
                      Upload a new JSON file to override the environment configuration at runtime.
                    </p>
                  )}
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label
                      className={`inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2 text-xs text-foreground transition ${
                        isUploadingGoogleClient ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-accent'
                      }`}
                    >
                      <input
                        type="file"
                        className="hidden"
                        accept="application/json"
                        onChange={handleGoogleClientFileChange}
                        disabled={isUploadingGoogleClient}
                      />
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                        <path
                          d="M10 4.167v11.666M4.167 10h11.666"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {isUploadingGoogleClient ? 'Uploading…' : 'Upload client_secret.json'}
                    </label>
                    {googleClientConfigured && !googleClientReadOnly && (
                      <button
                        type="button"
                        onClick={removeGoogleClientCredentials}
                        disabled={isRemovingGoogleClient}
                        className="text-sm text-muted transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isRemovingGoogleClient ? 'Removing…' : 'Remove credentials'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-surface/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Notion</p>
                    <p className="text-xs text-muted">Sync notes and databases</p>
                  </div>
                  {notionConnected ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-border px-3 py-1 text-xs font-medium text-muted">
                      Not connected
                    </span>
                  )}
                </div>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs text-muted">Current secret</p>
                    <p
                      className={`mt-1 font-mono text-sm ${hasNotionSecret ? 'text-foreground' : 'text-muted'}`}
                    >
                      {hasNotionSecret ? notionSecretDisplay : 'None saved'}
                    </p>
                  </div>
                  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                    <input
                      type="password"
                      value={notionSecret}
                      onChange={(event) => setNotionSecret(event.target.value)}
                      placeholder="Paste integration secret"
                      className="w-full flex-1 rounded-full border border-border bg-background/60 px-4 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-0"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={saveNotionSecret}
                      disabled={isSavingNotionSecret || !notionSecret.trim()}
                      className="inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {notionSaveButtonText}
                    </button>
                    {hasNotionSecret && (
                      <button
                        type="button"
                        onClick={removeNotionSecret}
                        disabled={isRemovingNotionSecret}
                        className="text-sm text-muted transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {notionRemoveButtonText}
                      </button>
                    )}
                  </div>
                  {notionSecretSaved && (
                    <p className="text-xs text-emerald-400">Secret saved ✓</p>
                  )}
                  <p className="text-xs leading-relaxed text-muted">
                    Create a private integration in Notion, copy its secret, then share any relevant databases or pages with it.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-6 lg:auto-rows-fr lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <section className="flex flex-col rounded-3xl border border-border bg-card/80 p-6 shadow-sm lg:row-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Provider &amp; Model</h2>
                  <p className="mt-1 text-xs text-muted">Choose which provider powers chats and set the default model for new conversations.</p>
                </div>
                  {modelSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
              </div>
              <div className="mt-4 flex flex-1 flex-col justify-evenly">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-muted">Provider</span>
                  <div
                    className="inline-flex items-center whitespace-nowrap rounded-full border border-border bg-card/70 p-0.5"
                    role="radiogroup"
                    aria-label="AI provider"
                  >
                    <button
                      type="button"
                      className={`flex items-center justify-center rounded-full px-3 py-1.5 text-sm transition ${
                        provider === 'openrouter' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'
                      }`}
                      aria-pressed={provider === 'openrouter'}
                      onClick={() => saveProvider('openrouter')}
                    >
                      OpenRouter
                    </button>
                    <button
                      type="button"
                      className={`flex items-center justify-center rounded-full px-3 py-1.5 text-sm transition ${
                        provider === 'anthropic' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                      aria-pressed={provider === 'anthropic'}
                      onClick={() => saveProvider('anthropic')}
                      disabled={!hasAnthropicKey && provider !== 'anthropic'}
                      title={!hasAnthropicKey ? 'Add your Anthropic API key first' : undefined}
                    >
                      Anthropic
                    </button>
                  </div>
                </div>
                {!hasAnthropicKey && (
                  <p className="text-xs text-amber-500">Add an Anthropic API key to enable the Anthropic provider toggle.</p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-muted">Default model</span>
                  <select
                    value={defaultModel}
                    onChange={(event) => setDefaultModel(event.target.value)}
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  >
                    <option value="anthropic/claude-sonnet-4.5">Claude Sonnet 4.5</option>
                    <option value="anthropic/claude-haiku-4.5">Claude Haiku 4.5</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-muted">Routing preference</span>
                  <select
                    value={routingVariant}
                    onChange={(event) => setRoutingVariant(event.target.value as 'floor' | 'nitro' | '')}
                    disabled={provider === 'anthropic'}
                    className={`rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground ${provider === 'anthropic' ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <option value="floor">Price-first (:floor)</option>
                    <option value="nitro">Speed-first (:nitro)</option>
                    <option value="">No variant</option>
                  </select>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={saveDefaultModel}
                    disabled={isSavingModel}
                    className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:opacity-60"
                  >
                    {isSavingModel ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">Routing preference applies only when using OpenRouter.</p>
            </section>

            <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">OpenRouter API Key</h2>
                    <p className="text-xs text-muted">Use Claude via Openrouter.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {keySaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                        openRouterEnabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-border text-muted'
                      }`}
                    >
                      {openRouterEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <input
                    type={hasExistingKey ? 'text' : 'password'}
                    value={hasExistingKey ? openRouterDisplay : openRouterKey}
                    onChange={(event) => {
                      if (hasExistingKey) return;
                      setOpenRouterKey(event.target.value);
                    }}
                    placeholder="sk-or-..."
                    readOnly={hasExistingKey}
                    autoComplete="off"
                    className={`w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none ${
                      hasExistingKey ? 'cursor-not-allowed bg-surface/70' : ''
                    }`}
                  />
                  {!hasExistingKey && (
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={saveOpenRouterKey}
                        disabled={isSavingKey}
                        className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:opacity-60"
                      >
                        {isSavingKey ? 'Saving…' : 'Save Key'}
                      </button>
                    </div>
                  )}
                  {hasExistingKey && (
                    <button
                      type="button"
                      onClick={removeOpenRouterKey}
                      disabled={isRemovingKey}
                      className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRemovingKey ? 'Removing…' : 'Remove key'}
                    </button>
                  )}
                  {/* helper text removed to reduce vertical space */}
                </div>
              </section>

            <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Anthropic API Key</h2>
                    <p className="text-xs text-muted">Use Claude directly via Anthropic.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {anthKeySaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                        anthropicEnabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-border text-muted'
                      }`}
                    >
                      {anthropicEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <input
                    type={hasAnthropicKey ? 'text' : 'password'}
                    value={hasAnthropicKey ? anthropicDisplay : anthropicKey}
                    onChange={(event) => {
                      if (hasAnthropicKey) return;
                      setAnthropicKey(event.target.value);
                    }}
                    placeholder="sk-ant-..."
                    readOnly={hasAnthropicKey}
                    autoComplete="off"
                    className={`w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none ${
                      hasAnthropicKey ? 'cursor-not-allowed bg-surface/70' : ''
                    }`}
                  />
                  {!hasAnthropicKey && (
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={saveAnthropicKey}
                        disabled={isSavingAnthKey}
                        className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:opacity-60"
                      >
                        {isSavingAnthKey ? 'Saving…' : 'Save Key'}
                      </button>
                    </div>
                  )}
                  {hasAnthropicKey && (
                    <button
                      type="button"
                      onClick={removeAnthropicKey}
                      disabled={isRemovingAnthKey}
                      className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRemovingAnthKey ? 'Removing…' : 'Remove key'}
                    </button>
                  )}
                  {/* helper text removed to reduce vertical space */}
                </div>
              </section>

          </div>
        </div>

        {/* Workspace tips removed */}
      </div>
    </div>
  );
}
