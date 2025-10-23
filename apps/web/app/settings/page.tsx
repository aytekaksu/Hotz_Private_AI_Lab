'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// Theme toggle removed — app is permanently dark

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [isRemovingKey, setIsRemovingKey] = useState(false);
  const [anthropicKey, setAnthropicKey] = useState('');
  const [isSavingAnthKey, setIsSavingAnthKey] = useState(false);
  const [anthKeySaved, setAnthKeySaved] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [isRemovingAnthKey, setIsRemovingAnthKey] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultModel, setDefaultModel] = useState('anthropic/claude-haiku-4.5');
  const [routingVariant, setRoutingVariant] = useState<'floor' | 'nitro' | ''>('floor');
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);
  const [provider, setProvider] = useState<'openrouter' | 'anthropic'>('openrouter');

  useEffect(() => {
    const initSettings = async () => {
      const storedUserId = localStorage.getItem('userId');
      if (!storedUserId) {
        router.push('/');
        return;
      }

      try {
        const response = await fetch(`/api/users/${storedUserId}`);
        if (!response.ok) {
          localStorage.removeItem('userId');
          router.push('/');
          return;
        }
      } catch (error) {
        console.error('Error verifying user:', error);
        localStorage.removeItem('userId');
        router.push('/');
        return;
      }

      setUserId(storedUserId);
      await loadSettings(storedUserId);
    };

    initSettings();
  }, [router]);

  const loadSettings = async (uid: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/settings/openrouter-key?userId=${uid}`);
      const data = await response.json();
      if (data.hasKey) {
        setOpenRouterKey('••••••••••••••••');
        setHasExistingKey(true);
      }

      let anthropicKeyPresent = false;
      try {
        const aRes = await fetch(`/api/settings/anthropic-key?userId=${uid}`);
        const aData = await aRes.json();
        if (aData.hasKey) {
          anthropicKeyPresent = true;
          setAnthropicKey('••••••••••••••••');
          setHasAnthropicKey(true);
        } else {
          setHasAnthropicKey(false);
        }
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

      const statusResponse = await fetch(`/api/status?userId=${uid}`);
      const statusData = await statusResponse.json();
      setGoogleConnected(statusData.google_connected || false);
      setNotionConnected(statusData.notion_connected || false);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveOpenRouterKey = async () => {
    if (!openRouterKey || openRouterKey.startsWith('••••')) return;
    setIsSavingKey(true);
    setKeySaved(false);

    try {
      const response = await fetch('/api/settings/openrouter-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, apiKey: openRouterKey }),
      });

      if (response.ok) {
        setKeySaved(true);
        setOpenRouterKey('••••••••••••••••');
        setHasExistingKey(true);
        setTimeout(() => setKeySaved(false), 3000);
      } else {
        const errorData = await response.json();
        alert(`Failed to save API key: ${errorData.error || 'Unknown error'}`);
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
    if (!anthropicKey || anthropicKey.startsWith('••••')) return;
    setIsSavingAnthKey(true);
    setAnthKeySaved(false);

    try {
      const response = await fetch('/api/settings/anthropic-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, apiKey: anthropicKey }),
      });

      if (response.ok) {
        setAnthKeySaved(true);
        setAnthropicKey('••••••••••••••••');
        setHasAnthropicKey(true);
        setTimeout(() => setAnthKeySaved(false), 3000);
      } else {
        const errorData = await response.json();
        alert(`Failed to save API key: ${errorData.error || 'Unknown error'}`);
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
    window.location.href = `/api/auth/google?userId=${userId}`;
  };

  const connectNotion = () => {
    window.location.href = `/api/auth/notion?userId=${userId}`;
  };

  const disconnectGoogle = async () => {
    if (!confirm('Disconnect Google? Calendar and Tasks features will be disabled.')) return;
    try {
      const response = await fetch(`/api/auth/google?userId=${userId}`, { method: 'DELETE' });
      if (response.ok) {
        setGoogleConnected(false);
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

  const disconnectNotion = async () => {
    if (!confirm('Disconnect Notion account?')) return;
    try {
      await fetch(`/api/auth/notion?userId=${userId}`, { method: 'DELETE' });
      setNotionConnected(false);
    } catch (error) {
      console.error('Failed to disconnect Notion:', error);
      alert('Failed to disconnect Notion account');
    }
  };

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

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
            <h2 className="text-lg font-semibold">AI Provider</h2>
            <p className="mt-1 text-xs text-muted">Switch between OpenRouter and direct Anthropic calls.</p>
            <div className="mt-4 flex flex-wrap items-center gap-6 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="provider"
                  value="openrouter"
                  checked={provider === 'openrouter'}
                  onChange={() => saveProvider('openrouter')}
                />
                OpenRouter
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="provider"
                  value="anthropic"
                  checked={provider === 'anthropic'}
                  onChange={() => saveProvider('anthropic')}
                />
                Anthropic (direct)
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Default Chat Model</h2>
                <p className="text-xs text-muted">Applies to new chats. Only Claude Sonnet 4.5 and Claude Haiku 4.5 are available.</p>
              </div>
              {modelSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-muted">Model</label>
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
                <label className="text-xs text-muted">Routing preference</label>
                <select
                  value={routingVariant}
                  onChange={(event) => setRoutingVariant(event.target.value as 'floor' | 'nitro' | '')}
                  disabled={provider === 'anthropic'}
                  className={`rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground ${provider === 'anthropic' ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <option value="floor">Price-first (:floor)</option>
                  <option value="nitro">Speed-first (:nitro)</option>
                  <option value="">No variant</option>
                </select>
                <button
                  type="button"
                  onClick={saveDefaultModel}
                  disabled={isSavingModel}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:opacity-60"
                >
                  {isSavingModel ? 'Saving…' : 'Save'}
                </button>
              </div>
              <p className="text-xs text-muted">Routing preference applies only when using OpenRouter.</p>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">OpenRouter API Key</h2>
                <p className="text-xs text-muted">Authenticate requests to OpenRouter. Keys are encrypted locally.</p>
              </div>
              {keySaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
            </div>
            <div className="mt-4 space-y-3">
              <input
                type="password"
                value={openRouterKey}
                onChange={(event) => setOpenRouterKey(event.target.value)}
                placeholder="sk-or-..."
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={saveOpenRouterKey}
                  disabled={isSavingKey}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:opacity-60"
                >
                  {isSavingKey ? 'Saving…' : hasExistingKey ? 'Update Key' : 'Save Key'}
                </button>
                {hasExistingKey && (
                  <button
                    type="button"
                    onClick={removeOpenRouterKey}
                    disabled={isRemovingKey}
                    className="text-sm text-muted hover:text-foreground disabled:opacity-60"
                  >
                    {isRemovingKey ? 'Removing…' : 'Remove key'}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted">
                Your key is stored encrypted at rest. Removing it immediately signs the workspace out of OpenRouter.
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Anthropic API Key</h2>
                <p className="text-xs text-muted">Use Claude directly via Anthropic. Keys are encrypted locally.</p>
              </div>
              {anthKeySaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
            </div>
            <div className="mt-4 space-y-3">
              <input
                type="password"
                value={anthropicKey}
                onChange={(event) => setAnthropicKey(event.target.value)}
                placeholder="sk-ant-..."
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={saveAnthropicKey}
                  disabled={isSavingAnthKey}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:opacity-60"
                >
                  {isSavingAnthKey ? 'Saving…' : hasAnthropicKey ? 'Update Key' : 'Save Key'}
                </button>
                {hasAnthropicKey && (
                  <button
                    type="button"
                    onClick={removeAnthropicKey}
                    disabled={isRemovingAnthKey}
                    className="text-sm text-muted hover:text-foreground disabled:opacity-60"
                  >
                    {isRemovingAnthKey ? 'Removing…' : 'Remove key'}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted">Anthropic provider option requires this key.</p>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Connected services</h2>
            <p className="mt-1 text-xs text-muted">
              Link your Google and Notion accounts to unlock scheduling, task automation, and workspace syncing.
            </p>
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-border bg-surface/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {googleConnected ? (
                    <>
                      <button
                        type="button"
                        onClick={reconnectGoogle}
                        className="rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-foreground"
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
                      className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg"
                    >
                      Connect Google
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {notionConnected ? (
                    <button
                      type="button"
                      onClick={disconnectNotion}
                      className="text-sm text-muted transition hover:text-red-400"
                    >
                      Disconnect Notion
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={connectNotion}
                      className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg"
                    >
                      Connect Notion
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Workspace tips removed */}
      </div>
    </div>
  );
}
