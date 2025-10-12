'use client';

import { useState, useEffect, useRef } from 'react';
import { useChat } from 'ai/react';

export default function Home() {
  const [userId, setUserId] = useState<string>('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    api: '/api/chat',
    body: {
      conversationId: currentConversationId,
      userId,
      attachments,
    },
    onResponse: (response) => {
      const convId = response.headers.get('X-Conversation-Id');
      if (convId && convId !== currentConversationId) {
        setCurrentConversationId(convId);
        loadConversations();
      }
      setAttachments([]);
    },
  });

  // Initialize user
  useEffect(() => {
    const initUser = async () => {
      let storedUserId = localStorage.getItem('userId');
      if (!storedUserId) {
        const email = `user-${Date.now()}@local.dev`;
        const response = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await response.json();
        storedUserId = data.user.id;
        localStorage.setItem('userId', storedUserId);
      }
      setUserId(storedUserId);
    };
    initUser();
  }, []);

  // Load conversations
  const loadConversations = async () => {
    if (!userId) return;
    setIsLoadingConversations(true);
    try {
      const response = await fetch(`/api/conversations?userId=${userId}`);
      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Load conversation messages
  const loadConversation = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}`);
      const data = await response.json();
      setMessages(data.messages || []);
      setCurrentConversationId(conversationId);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  // Start new chat
  const startNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setAttachments([]);
  };

  // Delete conversation
  const deleteConversation = async (conversationId: string) => {
    if (!confirm('Delete this conversation?')) return;
    try {
      await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' });
      if (currentConversationId === conversationId) {
        startNewChat();
      }
      loadConversations();
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  // Handle file upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setAttachments((prev) => [...prev, ...data.attachments.map((a: any) => a.id)]);
    } catch (error) {
      console.error('Failed to upload files:', error);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Sidebar resizing
  const handleMouseDown = () => setIsResizing(true);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth >= 220 && newWidth <= 420) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!userId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-600">Initializing...</div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        {/* Sidebar */}
        {!isSidebarCollapsed && (
          <div
            className="relative h-full overflow-hidden border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
            style={{ width: `${sidebarWidth}px`, minWidth: '220px', maxWidth: '420px' }}
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">AI Assistant</h1>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-700"
                  aria-label="Collapse sidebar"
                  onClick={() => setIsSidebarCollapsed(true)}
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path d="M12 5l-4 5 4 5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {/* Conversations */}
              <div className="flex-1 overflow-y-auto p-4">
                <button
                  type="button"
                  onClick={startNewChat}
                  className="mb-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                >
                  + New Chat
                </button>

                <div className="space-y-2">
                  <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                    Recent Conversations
                  </h2>

                  {isLoadingConversations ? (
                    <div className="py-6 text-center">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                      <div className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Loading conversations...
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">Please wait</div>
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-500">No conversations yet</div>
                  ) : (
                    conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group flex items-center justify-between rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          currentConversationId === conv.id ? 'bg-gray-100 dark:bg-gray-700' : ''
                        }`}
                      >
                        <button
                          onClick={() => loadConversation(conv.id)}
                          className="flex-1 truncate text-left text-sm text-gray-900 dark:text-white"
                        >
                          {conv.title}
                        </button>
                        <button
                          onClick={() => deleteConversation(conv.id)}
                          className="ml-2 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Settings */}
              <div className="border-t border-gray-200 p-4 dark:border-gray-700">
                <a
                  href="/settings"
                  className="block w-full rounded-lg bg-gray-100 px-4 py-2 text-center text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  ⚙️ Settings
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Resize Handle */}
        {!isSidebarCollapsed && (
          <div
            className="flex-shrink-0 h-full w-2 cursor-col-resize bg-gray-200 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={handleMouseDown}
          />
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
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
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
            <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
              <div className="flex items-center gap-3">
                {/* File Attachment */}
                <div className="flex items-center gap-2">
                  <label className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:text-blue-300">
                    <span className="sr-only">Attach files</span>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-5 w-5">
                      <path
                        d="M7.5 11.25l3.79-3.8a1.75 1.75 0 1 1 2.47 2.47l-5.3 5.3a3.25 3.25 0 1 1-4.6-4.6l5.65-5.65"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      multiple
                      onChange={handleFileChange}
                    />
                  </label>

                  <div className="relative">
                    <button
                      type="button"
                      disabled
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors hover:border-blue-400 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:text-blue-300"
                      aria-haspopup="dialog"
                      aria-expanded="false"
                      aria-label="Conversation tool settings"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-5 w-5">
                        <path
                          d="M10 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Text Input */}
                <input
                  type="text"
                  placeholder="Type your message..."
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  value={input}
                  onChange={handleInputChange}
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  Send
                </button>
              </div>

              {attachments.length > 0 && (
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {attachments.length} file(s) attached
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
