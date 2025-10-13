'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [isRemovingKey, setIsRemovingKey] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initSettings = async () => {
      const storedUserId = localStorage.getItem('userId');
      if (!storedUserId) {
        router.push('/');
        return;
      }
      
      // Verify user exists
      try {
        const response = await fetch(`/api/users/${storedUserId}`);
        if (!response.ok) {
          // User doesn't exist, redirect to home to create new user
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
      loadSettings(storedUserId);
    };
    
    initSettings();
  }, [router]);

  const loadSettings = async (uid: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/settings/openrouter-key?userId=${uid}`);
      const data = await response.json();
      
      if (data.hasKey) {
        setOpenRouterKey('••••••••••••••••'); // Masked
        setHasExistingKey(true);
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
    if (!confirm('Are you sure you want to remove your OpenRouter API key? This will disable AI functionality.')) {
      return;
    }
    
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

  const connectGoogle = () => {
    window.location.href = `/api/auth/google?userId=${userId}`;
  };

  const connectNotion = () => {
    window.location.href = `/api/auth/notion?userId=${userId}`;
  };

  const disconnectGoogle = async () => {
    if (!confirm('Are you sure you want to disconnect your Google account? This will disable Calendar and Tasks features.')) return;
    
    try {
      const response = await fetch(`/api/auth/google?userId=${userId}`, { method: 'DELETE' });
      if (response.ok) {
        setGoogleConnected(false);
        alert('Google account disconnected successfully');
      } else {
        throw new Error('Failed to disconnect');
      }
    } catch (error) {
      console.error('Failed to disconnect Google:', error);
      alert('Failed to disconnect Google account');
    }
  };

  const reconnectGoogle = () => {
    if (confirm('Reconnect your Google account? This will replace your current connection.')) {
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
          {hasExistingKey && (
            <div className="mb-4 rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-green-800 dark:text-green-200">
                  API key is configured and working
                </span>
              </div>
            </div>
          )}
          
          <div className="flex gap-3">
            <input
              type="text"
              placeholder={hasExistingKey ? "Enter new API key to replace existing one" : "sk-or-v1-..."}
              value={openRouterKey}
              onChange={(e) => setOpenRouterKey(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <button
              onClick={saveOpenRouterKey}
              disabled={isSavingKey || !openRouterKey || openRouterKey.startsWith('••••')}
              className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {isSavingKey ? 'Saving...' : hasExistingKey ? 'Update' : 'Save'}
            </button>
            {hasExistingKey && (
              <button
                onClick={removeOpenRouterKey}
                disabled={isRemovingKey}
                className="rounded-lg bg-red-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {isRemovingKey ? 'Removing...' : 'Remove'}
              </button>
            )}
          </div>
          {keySaved && (
            <div className="mt-2 text-sm text-green-600 dark:text-green-400">
              ✓ API key {hasExistingKey ? 'updated' : 'saved'} successfully
            </div>
          )}
        </div>

        {/* Google OAuth */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Google Integration
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Connect your Google account to access Calendar and Tasks. The AI assistant can view, create, and manage your events and tasks.
          </p>
          
          {googleConnected && (
            <div className="mb-4 rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-green-800 dark:text-green-200">
                  Google account connected with Calendar and Tasks access
                </span>
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  googleConnected ? 'bg-green-500' : 'bg-gray-300'
                }`}
              />
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {googleConnected ? 'Connected' : 'Not connected'}
                </span>
                {googleConnected && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Permissions: Calendar, Tasks
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {googleConnected ? (
                <>
                  <button
                    onClick={reconnectGoogle}
                    className="rounded-lg bg-blue-100 px-4 py-2 text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800"
                  >
                    Reconnect
                  </button>
                  <button
                    onClick={disconnectGoogle}
                    className="rounded-lg bg-red-100 px-4 py-2 text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
                  >
                    Disconnect
                  </button>
                </>
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
