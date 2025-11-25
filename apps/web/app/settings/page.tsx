'use client';

export const dynamic = 'force-dynamic';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useRouter } from 'next/navigation';
import { uploadWithProgress } from '@/lib/client/upload';
// Theme toggle removed — app is permanently dark

const MASK_PREFIX = '••••••••••';
const formatKeyPreview = (suffix: string | null) => `${MASK_PREFIX}${suffix ?? '??????????'}`;

type SecretSettingConfig = {
  label: string;
  endpoint: string;
  requestKey: 'apiKey' | 'secret';
  suffixKey: string;
  confirmRemoveMessage: string;
  fallbackSuffixLength: number;
  allowOverwrite?: boolean;
};

type SecretSettingController = {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  display: string;
  hasSecret: boolean;
  isSaving: boolean;
  isRemoving: boolean;
  saved: boolean;
  syncRemoteState: (present: boolean, suffix: string | null) => void;
  save: (userId: string) => Promise<boolean>;
  remove: (userId: string) => Promise<boolean>;
};

const OPENROUTER_SECRET_CONFIG: SecretSettingConfig = {
  label: 'OpenRouter API key',
  endpoint: '/api/settings/openrouter-key',
  requestKey: 'apiKey',
  suffixKey: 'keySuffix',
  confirmRemoveMessage: 'Remove your OpenRouter API key? This will disable AI functionality.',
  fallbackSuffixLength: 10,
};

const ANTHROPIC_SECRET_CONFIG: SecretSettingConfig = {
  label: 'Anthropic API key',
  endpoint: '/api/settings/anthropic-key',
  requestKey: 'apiKey',
  suffixKey: 'keySuffix',
  confirmRemoveMessage: 'Remove your Anthropic API key?',
  fallbackSuffixLength: 10,
};

const NOTION_SECRET_CONFIG: SecretSettingConfig = {
  label: 'Notion integration secret',
  endpoint: '/api/settings/notion-secret',
  requestKey: 'secret',
  suffixKey: 'secretSuffix',
  confirmRemoveMessage: 'Remove the Notion integration secret? Notion tools will be disabled.',
  fallbackSuffixLength: 6,
  allowOverwrite: true,
};

function useSecretSetting(config: SecretSettingConfig): SecretSettingController {
  const [input, setInput] = useState('');
  const [display, setDisplay] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const syncRemoteState = useCallback((present: boolean, suffix: string | null) => {
    setHasSecret(present);
    setDisplay(present ? formatKeyPreview(suffix) : '');
    setInput('');
  }, []);

  const triggerSavedIndicator = useCallback(() => {
    setSaved(true);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => setSaved(false), 3000);
  }, []);

  const save = useCallback(
    async (userId: string) => {
      if (!userId || (!config.allowOverwrite && hasSecret)) return false;
      const plaintext = input.trim();
      if (!plaintext) return false;

      setIsSaving(true);
      setSaved(false);

      try {
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, [config.requestKey]: plaintext }),
        });

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          alert(`Failed to save ${config.label}: ${result?.error || 'Unknown error'}`);
          return false;
        }

        const suffix =
          typeof result?.[config.suffixKey] === 'string'
            ? result[config.suffixKey]
            : plaintext.slice(-config.fallbackSuffixLength);

        syncRemoteState(true, suffix);
        triggerSavedIndicator();
        return true;
      } catch (error) {
        console.error(`Failed to save ${config.label}:`, error);
        alert(`Failed to save ${config.label}`);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [config, hasSecret, input, syncRemoteState, triggerSavedIndicator],
  );

  const remove = useCallback(
    async (userId: string) => {
      if (!userId || !hasSecret) {
        return false;
      }

      if (config.confirmRemoveMessage && !confirm(config.confirmRemoveMessage)) {
        return false;
      }

      setIsRemoving(true);

      try {
        const response = await fetch(config.endpoint, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          alert(`Failed to remove ${config.label}: ${result?.error || 'Unknown error'}`);
          return false;
        }

        syncRemoteState(false, null);
        setSaved(false);
        return true;
      } catch (error) {
        console.error(`Failed to remove ${config.label}:`, error);
        alert(`Failed to remove ${config.label}`);
        return false;
      } finally {
        setIsRemoving(false);
      }
    },
    [config, hasSecret, syncRemoteState],
  );

  return useMemo(
    () => ({
      input,
      setInput,
      display,
      hasSecret,
      isSaving,
      isRemoving,
      saved,
      syncRemoteState,
      save,
      remove,
    }),
    [display, hasSecret, input, isRemoving, isSaving, remove, save, saved, syncRemoteState],
  );
}

type ApiKeySectionProps = {
  title: string;
  description: string;
  placeholder: string;
  secret: SecretSettingController;
  enabled: boolean;
  onSave: () => Promise<unknown> | unknown;
  onRemove: () => Promise<unknown> | unknown;
};

function ApiKeySection({ title, description, placeholder, secret, enabled, onSave, onRemove }: ApiKeySectionProps) {
  const readOnly = secret.hasSecret;
  const value = readOnly ? secret.display : secret.input;

  return (
    <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {secret.saved && <span className="text-xs text-emerald-400">Saved ✓</span>}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
              enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-border text-muted'
            }`}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <input
          type={readOnly ? 'text' : 'password'}
          value={value}
          onChange={(event) => {
            if (readOnly) return;
            secret.setInput(event.target.value);
          }}
          placeholder={placeholder}
          readOnly={readOnly}
          autoComplete="off"
          className={`w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none ${
            readOnly ? 'cursor-not-allowed bg-surface/70' : ''
          }`}
        />
        {!readOnly ? (
          <button
            type="button"
            onClick={() => {
              void onSave();
            }}
            disabled={secret.isSaving}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:opacity-60"
          >
            {secret.isSaving ? 'Saving…' : 'Save Key'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              void onRemove();
            }}
            disabled={secret.isRemoving}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {secret.isRemoving ? 'Removing…' : 'Remove key'}
          </button>
        )}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>('');
  const openRouterSecret = useSecretSetting(OPENROUTER_SECRET_CONFIG);
  const anthropicSecret = useSecretSetting(ANTHROPIC_SECRET_CONFIG);
  const notionSecretField = useSecretSetting(NOTION_SECRET_CONFIG);
  const syncOpenRouter = openRouterSecret.syncRemoteState;
  const syncAnthropic = anthropicSecret.syncRemoteState;
  const syncNotionSecret = notionSecretField.syncRemoteState;
  const [googleConnected, setGoogleConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleClientConfigured, setGoogleClientConfigured] = useState(false);
  const [googleClientSource, setGoogleClientSource] = useState<'database' | 'env' | null>(null);
  const [googleClientIdSuffix, setGoogleClientIdSuffix] = useState<string | null>(null);
  const [googleClientProjectId, setGoogleClientProjectId] = useState<string | null>(null);
  const [googleClientUpdatedAt, setGoogleClientUpdatedAt] = useState<string | null>(null);
  const [isUploadingGoogleClient, setIsUploadingGoogleClient] = useState(false);
  const [googleUploadProgress, setGoogleUploadProgress] = useState<number | null>(null);
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
    let openrouterKeyPresent = false;
    let anthropicKeyPresent = false;
    try {
      const response = await fetch(`/api/settings/openrouter-key?userId=${uid}`);
      const data = await response.json();
      openrouterKeyPresent = !!data.hasKey;
      if (openrouterKeyPresent) {
        const suffix = typeof data.keySuffix === 'string' ? data.keySuffix : null;
        syncOpenRouter(true, suffix);
      } else {
        syncOpenRouter(false, null);
      }

      try {
        const aRes = await fetch(`/api/settings/anthropic-key?userId=${uid}`);
        const aData = await aRes.json();
        anthropicKeyPresent = !!aData.hasKey;
        if (anthropicKeyPresent) {
          const suffix = typeof aData.keySuffix === 'string' ? aData.keySuffix : null;
          syncAnthropic(true, suffix);
        } else {
          syncAnthropic(false, null);
        }
      } catch (error) {
        console.warn('Failed to load Anthropic key state:', error);
      }

      try {
        const modelRes = await fetch(`/api/settings/default-model?userId=${uid}`);
        if (modelRes.ok) {
          const m = await modelRes.json();
          const allowedModels = ['anthropic/claude-sonnet-4.5', 'anthropic/claude-haiku-4.5', 'anthropic/claude-opus-4.5'];
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
          const preferred = p.provider === 'anthropic' ? 'anthropic' : 'openrouter';
          if (preferred === 'anthropic' && anthropicKeyPresent) {
            setProvider('anthropic');
          } else if (preferred === 'openrouter' && openrouterKeyPresent) {
            setProvider('openrouter');
          } else if (openrouterKeyPresent) {
            setProvider('openrouter');
          } else if (anthropicKeyPresent) {
            setProvider('anthropic');
          } else {
            setProvider('openrouter');
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
            syncNotionSecret(true, suffix);
          } else {
            syncNotionSecret(false, null);
          }
        } else {
          notionSecretConfigured = false;
          syncNotionSecret(false, null);
        }
      } catch (error) {
        console.warn('Failed to load Notion integration state:', error);
        notionSecretConfigured = false;
        syncNotionSecret(false, null);
      }
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
  }, [fetchGoogleClientConfig, syncAnthropic, syncNotionSecret, syncOpenRouter]);

  useEffect(() => {
    const initSettings = async () => {
      setInitError(null);
      setIsLoading(true);

      try {
        // Fetch the authenticated user from the session
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        
        if (data.authenticated && data.user?.id) {
          setUserId(data.user.id);
          await loadSettings(data.user.id);
        } else {
          // Not authenticated - redirect to login
          window.location.href = '/login';
        }
      } catch (error) {
        console.error('Error fetching session:', error);
        setInitError('Unable to verify authentication. Please reload the page.');
        setIsLoading(false);
      }
    };

    initSettings();
  }, [loadSettings]);

  const saveOpenRouterKey = () => openRouterSecret.save(userId);

  const removeOpenRouterKey = async () => {
    const removed = await openRouterSecret.remove(userId);
    if (removed && provider === 'openrouter') {
      if (anthropicSecret.hasSecret) {
        await saveProvider('anthropic');
      } else {
        setProvider('openrouter');
      }
    }
  };

  const saveAnthropicKey = () => anthropicSecret.save(userId);

  const removeAnthropicKey = async () => {
    const removed = await anthropicSecret.remove(userId);
    if (removed) {
      setProvider('openrouter');
      try {
        await fetch('/api/settings/provider', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, provider: 'openrouter' }),
        });
      } catch (error) {
        console.error('Failed to reset provider preference after removing Anthropic key:', error);
      }
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
    if (prov === 'anthropic' && !anthropicSecret.hasSecret) {
      alert('Add your Anthropic API key first.');
      setProvider(openRouterSecret.hasSecret ? 'openrouter' : 'openrouter');
      return;
    }
    if (prov === 'openrouter' && !openRouterSecret.hasSecret) {
      alert('Add your OpenRouter API key first.');
      setProvider(anthropicSecret.hasSecret ? 'anthropic' : 'openrouter');
      return;
    }
    setProvider(prov);
    try {
      const response = await fetch('/api/settings/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, provider: prov }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Failed to save provider preference');
      }
    } catch (error) {
      console.error('Failed to save provider preference:', error);
      alert(error instanceof Error ? error.message : 'Failed to save provider preference');
    }
  };

  const connectGoogle = () => {
    if (!googleClientConfigured) {
      setGoogleClientFeedback({ type: 'error', message: 'Upload Google client credentials first' });
      setTimeout(() => setGoogleClientFeedback(null), 4000);
      return;
    }
    // Use reconnect mode since user is already logged in
    window.location.href = `/api/auth/google?mode=reconnect`;
  };

  const disconnectGoogle = async () => {
    if (!confirm('Disconnect Google? Calendar and Tasks features will be disabled.')) return;
    try {
      const response = await fetch(`/api/auth/google`, { method: 'DELETE' });
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
    setGoogleUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await uploadWithProgress<{ error?: string }>(
        '/api/settings/google-credentials',
        formData,
        { onProgress: (percent) => setGoogleUploadProgress(percent) },
      );
      if ((result as any)?.error) {
        throw new Error((result as any).error || 'Failed to save Google credentials');
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
      setGoogleUploadProgress(null);
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
    const saved = await notionSecretField.save(userId);
    if (saved) {
      setNotionConnected(true);
    }
  };

  const removeNotionSecret = async () => {
    const removed = await notionSecretField.remove(userId);
    if (removed) {
      setNotionConnected(false);
    }
  };

  const openRouterEnabled = provider === 'openrouter' && openRouterSecret.hasSecret;
  const anthropicEnabled = provider === 'anthropic' && anthropicSecret.hasSecret;
  const hasNotionSecret = notionSecretField.hasSecret;
  const notionSaveLabel = hasNotionSecret ? 'Update secret' : 'Save secret';
  const notionSaveButtonText = notionSecretField.isSaving ? 'Saving…' : notionSaveLabel;
  const notionRemoveButtonText = notionSecretField.isRemoving ? 'Removing…' : 'Remove secret';
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
            <div className="mt-2 flex items-center gap-3">
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
          <button
            onClick={async () => {
              try {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login';
              } catch (error) {
                console.error('Logout failed:', error);
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-red-400/50 hover:text-red-400"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
              <path d="M13.333 14.167 17.5 10m0 0-4.167-4.167M17.5 10h-10m0-7.5H5A1.667 1.667 0 0 0 3.333 4.167v11.666A1.667 1.667 0 0 0 5 17.5h2.5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Logout
          </button>
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
                    {isUploadingGoogleClient && (
                      <div className="flex items-center gap-2 text-[11px] text-muted">
                        <div className="relative h-1.5 w-28 overflow-hidden rounded-full bg-border/60">
                          <div
                            className="h-full bg-accent transition-[width]"
                            style={{ width: `${Math.max(googleUploadProgress ?? 10, 5)}%` }}
                          />
                        </div>
                        <span>{googleUploadProgress !== null ? `${googleUploadProgress}%` : 'Uploading…'}</span>
                      </div>
                    )}
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
                      {hasNotionSecret ? notionSecretField.display : 'None saved'}
                    </p>
                  </div>
                  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                    <input
                      type="password"
                      value={notionSecretField.input}
                      onChange={(event) => notionSecretField.setInput(event.target.value)}
                      placeholder="Paste integration secret"
                      className="w-full flex-1 rounded-full border border-border bg-background/60 px-4 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-0"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={saveNotionSecret}
                      disabled={notionSecretField.isSaving || !notionSecretField.input.trim()}
                      className="inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {notionSaveButtonText}
                    </button>
                    {hasNotionSecret && (
                      <button
                        type="button"
                        onClick={removeNotionSecret}
                        disabled={notionSecretField.isRemoving}
                        className="text-sm text-muted transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {notionRemoveButtonText}
                      </button>
                    )}
                  </div>
                  {notionSecretField.saved && (
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
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                      aria-pressed={provider === 'openrouter'}
                      onClick={() => saveProvider('openrouter')}
                      disabled={!openRouterSecret.hasSecret && provider !== 'openrouter'}
                      title={!openRouterSecret.hasSecret ? 'Add your OpenRouter API key first' : undefined}
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
                      disabled={!anthropicSecret.hasSecret && provider !== 'anthropic'}
                      title={!anthropicSecret.hasSecret ? 'Add your Anthropic API key first' : undefined}
                    >
                      Anthropic
                    </button>
                  </div>
                </div>
                {!anthropicSecret.hasSecret && (
                  <p className="text-xs text-amber-500">Add an Anthropic API key to enable the Anthropic provider toggle.</p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-muted">Selected model</span>
                  <select
                    value={defaultModel}
                    onChange={(event) => setDefaultModel(event.target.value)}
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  >
                    <option value="anthropic/claude-haiku-4.5">Claude Haiku 4.5 — smart enough</option>
                    <option value="anthropic/claude-sonnet-4.5">Claude Sonnet 4.5 — smart</option>
                    <option value="anthropic/claude-opus-4.5">Claude Opus 4.5 — smartest</option>
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

            <ApiKeySection
              title="OpenRouter API Key"
              description="Use Claude via Openrouter."
              placeholder="sk-or-..."
              secret={openRouterSecret}
              enabled={openRouterEnabled}
              onSave={saveOpenRouterKey}
              onRemove={removeOpenRouterKey}
            />

            <ApiKeySection
              title="Anthropic API Key"
              description="Use Claude directly via Anthropic."
              placeholder="sk-ant-..."
              secret={anthropicSecret}
              enabled={anthropicEnabled}
              onSave={saveAnthropicKey}
              onRemove={removeAnthropicKey}
            />

          </div>
        </div>

        {/* Workspace tips removed */}
      </div>
    </div>
  );
}
