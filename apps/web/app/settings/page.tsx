'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function Settings() {
  const [userId, setUserId] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
    }
    
    // Check for OAuth callback messages
    const success = searchParams?.get('success');
    const error = searchParams?.get('error');
    
    if (success === 'google_connected') {
      setMessage({ type: 'success', text: 'Google account connected successfully!' });
    } else if (success === 'notion_connected') {
      setMessage({ type: 'success', text: 'Notion account connected successfully!' });
    } else if (error) {
      setMessage({ type: 'error', text: `OAuth error: ${error}` });
    }
  }, [searchParams]);
  
  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/settings/openrouter-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, apiKey }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save API key');
      }
      
      setMessage({ type: 'success', text: 'OpenRouter API key saved successfully!' });
      setApiKey('');
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save API key. Please try again.' });
    } finally {
      setSaving(false);
    }
  };
  
  const handleConnectGoogle = () => {
    window.location.href = `/api/auth/google?userId=${userId}`;
  };
  
  const handleConnectNotion = () => {
    window.location.href = `/api/auth/notion?userId=${userId}`;
  };
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <a
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block"
          >
            ← Back to Chat
          </a>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Configure your AI assistant integrations
          </p>
        </div>
        
        {message && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 border border-green-400 dark:border-green-600'
                : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 border border-red-400 dark:border-red-600'
            }`}
          >
            {message.text}
          </div>
        )}
        
        {/* OpenRouter API Key */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            OpenRouter API Key
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
            Your OpenRouter API key is used to access Claude Sonnet 4. You pay directly for usage.
            <a
              href="https://openrouter.ai/activity"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline ml-2"
            >
              View your usage →
            </a>
          </p>
          
          <form onSubmit={handleSaveApiKey}>
            <div className="mb-4">
              <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Key
              </label>
              <input
                type="password"
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={saving || !apiKey.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save API Key'}
            </button>
          </form>
        </div>
        
        {/* Google Integration */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Google Integration
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
            Connect your Google account to access Calendar and Tasks.
          </p>
          
          <button
            onClick={handleConnectGoogle}
            className="px-6 py-2 bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Connect Google Account</span>
          </button>
        </div>
        
        {/* Notion Integration */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Notion Integration
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
            Connect your Notion workspace to manage pages and databases.
          </p>
          
          <button
            onClick={handleConnectNotion}
            className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.887-.748-.84l-15.177.887c-.56.047-.747.327-.747.887zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
            </svg>
            <span>Connect Notion</span>
          </button>
        </div>
      </div>
    </div>
  );
}


