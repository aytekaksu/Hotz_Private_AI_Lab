'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (!storedUserId) {
      router.push('/');
      return;
    }
    setUserId(storedUserId);
    loadSettings(storedUserId);
  }, [router]);

  const loadSettings = async (uid: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/settings/openrouter-key?userId=${uid}`);
      const data = await response.json();
      
      if (data.hasKey) {
        setOpenRouterKey('••••••••••••••••'); // Masked
      }

      // Check OAuth connections
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
        setTimeout(() => setKeySaved(false), 3000);
      } else {
        alert('Failed to save API key');
      }
    } catch (error) {
      console.error('Failed to save API key:', error);
      alert('Failed to save API key');
    } finally {
      setIsSavingKey(false);
    }
  };

  const connectGoogle = () => {
    window.location.href = `/api/auth/google?userId=${userId}`;
  };

  const connectNotion = () => {
    window.location.href = `/api/auth/notion?userId=${userId}`;
  };

  const disconnectGoogle = async () => {
    if (!confirm('Disconnect Google account?')) return;
    
    try {
      await fetch(`/api/auth/google?userId=${userId}`, { method: 'DELETE' });
      setGoogleConnected(false);
    } catch (error) {
      console.error('Failed to disconnect Google:', error);
      alert('Failed to disconnect Google account');
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
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <button
            onClick={() => router.push('/')}
            className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            ← Back to Chat
          </button>
        </div>

        {/* OpenRouter API Key */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            OpenRouter API Key
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Your API key is used to access AI models through OpenRouter. Get your key from{' '}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              openrouter.ai/keys
            </a>
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="sk-or-v1-..."
              value={openRouterKey}
              onChange={(e) => setOpenRouterKey(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <button
              onClick={saveOpenRouterKey}
              disabled={isSavingKey || !openRouterKey || openRouterKey.startsWith('••••')}
              className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {isSavingKey ? 'Saving...' : 'Save'}
            </button>
          </div>
          {keySaved && (
            <div className="mt-2 text-sm text-green-600 dark:text-green-400">
              ✓ API key saved successfully
            </div>
          )}
        </div>

        {/* Google OAuth */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Google Integration
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Connect your Google account to access Calendar and Tasks
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  googleConnected ? 'bg-green-500' : 'bg-gray-300'
                }`}
              />
              <span className="text-gray-900 dark:text-white">
                {googleConnected ? 'Connected' : 'Not connected'}
              </span>
            </div>
            {googleConnected ? (
              <button
                onClick={disconnectGoogle}
                className="rounded-lg bg-red-100 px-4 py-2 text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={connectGoogle}
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Connect Google
              </button>
            )}
          </div>
        </div>

        {/* Notion OAuth */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Notion Integration
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Connect your Notion account to manage pages and databases
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  notionConnected ? 'bg-green-500' : 'bg-gray-300'
                }`}
              />
              <span className="text-gray-900 dark:text-white">
                {notionConnected ? 'Connected' : 'Not connected'}
              </span>
            </div>
            {notionConnected ? (
              <button
                onClick={disconnectNotion}
                className="rounded-lg bg-red-100 px-4 py-2 text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={connectNotion}
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Connect Notion
              </button>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Note:</strong> All credentials are encrypted and stored securely. The AI assistant
            uses these connections to perform tasks on your behalf.
          </p>
        </div>
      </div>
    </div>
  );
}
