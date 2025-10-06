'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';

// Note: Database initialization happens on the server side, not in the browser

export default function Home() {
  const [userId, setUserId] = useState<string>('');
  const [conversationId, setConversationId] = useState<string>('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState<boolean>(true);
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [remountKey, setRemountKey] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Initialize user (in a real app, this would be from auth)
  useEffect(() => {
    // Use a consistent user ID for development
    const consistentUserId = '1a1b8ad1-7668-484c-ac0d-cf46048cbbe7';
    localStorage.setItem('userId', consistentUserId);
    setUserId(consistentUserId);
    
    // Set loading state immediately when user is set
    setConversationsLoading(true);
  }, []);
  
  // Load conversations immediately when userId is set
  useEffect(() => {
    if (userId) {
      const startTime = performance.now();
      console.log('🔄 Starting conversations load...');
      
      // Don't set loading to true here since it's already set in user initialization
      setConversations([]); // Clear previous conversations
      
      // Use AbortController for better request handling
      const controller = new AbortController();
      
      fetch(`/api/conversations?userId=${userId}`, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          const endTime = performance.now();
          const loadTime = endTime - startTime;
          console.log(`✅ Conversations loaded in ${loadTime.toFixed(2)}ms`);
          
          setConversations(data.conversations || []);
          setConversationsLoading(false);
        })
        .catch(err => {
          if (err.name !== 'AbortError') {
            const endTime = performance.now();
            const loadTime = endTime - startTime;
            console.error(`❌ Failed to load conversations after ${loadTime.toFixed(2)}ms:`, err);
            setConversationsLoading(false);
          }
        });
      
      // Cleanup function
      return () => controller.abort();
    }
  }, [userId]);
  
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat',
    body: {
      userId,
      conversationId,
    },
    id: conversationId || 'new',
    initialMessages,
    onResponse: (response) => {
      const newConvId = response.headers.get('X-Conversation-Id');
      if (newConvId && !conversationId) {
        setConversationId(newConvId);
        // Reload conversations
        fetch(`/api/conversations?userId=${userId}`)
          .then(res => res.json())
          .then(data => setConversations(data.conversations || []));
      }
    },
  });
  
  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const startNewConversation = () => {
    setConversationId('');
    setInitialMessages([]);
    setRemountKey((k) => k + 1);
  };
  
  const loadConversation = async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    // Map backend message shape to useChat expected shape
    const mapped = (data.messages || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }));
    setConversationId(id);
    setInitialMessages(mapped);
    setRemountKey((k) => k + 1);
  };
  
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">AI Assistant</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <button
            onClick={startNewConversation}
            className="w-full mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Chat
          </button>
          
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Recent Conversations</h2>
            {conversationsLoading ? (
              <div className="text-center py-6">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-2 font-medium">Loading conversations...</div>
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">Please wait</div>
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-4">
                <div className="text-sm text-gray-500 dark:text-gray-400">No conversations yet</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start a new chat to begin</div>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    conversationId === conv.id
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="truncate">{conv.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {new Date(conv.updated_at).toLocaleDateString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <a
            href="/settings"
            className="block w-full px-4 py-2 text-center bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            ⚙️ Settings
          </a>
        </div>
      </div>
      
      {/* Main Chat Area */}
      <div key={remountKey} className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  Welcome to AI Assistant
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Ask me to help with your calendar, tasks, or Notion workspace.
                </p>
                <div className="text-left max-w-md mx-auto space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    &quot;What meetings do I have this week?&quot;
                  </div>
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    &quot;Add a task to buy groceries tomorrow&quot;
                  </div>
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    &quot;Create a new page in my Projects database&quot;
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                    {message.toolInvocations && (
                      <div className="mt-2 text-xs opacity-75">
                        🔧 Using tools...
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              {error && (
                <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg">
                  <p className="font-bold">Error</p>
                  <p className="text-sm">{error.message}</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        
        {/* Input */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="flex space-x-4">
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Type your message..."
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


