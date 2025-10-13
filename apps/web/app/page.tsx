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
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingAttachmentsRef = useRef<any[]>([]);

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    api: '/api/chat',
    body: {
      conversationId: currentConversationId,
      userId,
      attachments: pendingAttachmentsRef.current.map(a => a.id),
    },
    onResponse: (response) => {
      const convId = response.headers.get('X-Conversation-Id');
      if (convId && convId !== currentConversationId) {
        setCurrentConversationId(convId);
        loadConversations();
      }
    },
    onFinish: (message) => {
      // Clear pending attachments after the message is finished
      pendingAttachmentsRef.current = [];
    },
  });

  // Custom submit handler to clear attachments immediately
  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!input.trim() && attachments.length === 0) return;
    
    // Store current attachments in ref for the API request
    const currentAttachments = [...attachments];
    pendingAttachmentsRef.current = currentAttachments;
    
    // Clear attachments immediately from input UI
    setAttachments([]);
    
    // Add attachments to the user message immediately
    if (currentAttachments.length > 0) {
      // We need to add the attachments to the message that will be created
      // Since useChat will create a new message, we'll add attachments after it's created
      // Use requestAnimationFrame for immediate execution in the next frame
      requestAnimationFrame(() => {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (lastIndex >= 0 && newMessages[lastIndex].role === 'user') {
            (newMessages[lastIndex] as any).attachments = currentAttachments;
          }
          return newMessages;
        });
      });
    }
    
    // Call the original submit handler
    handleSubmit(e);
  };

  // Initialize user
  useEffect(() => {
    const initUser = async () => {
      let storedUserId: string | null = localStorage.getItem('userId');
      
      // If we have a stored user ID, verify it exists
      if (storedUserId) {
        try {
          const response = await fetch(`/api/users/${storedUserId}`);
          if (!response.ok) {
            // User doesn't exist, clear localStorage and create new user
            localStorage.removeItem('userId');
            storedUserId = null;
          }
        } catch (error) {
          console.error('Error verifying user:', error);
          localStorage.removeItem('userId');
          storedUserId = null;
        }
      }
      
      // Create new user if none exists or verification failed
      if (!storedUserId) {
        // Use a consistent email for single-user app
        const email = 'user@assistant.local';
        try {
          const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const data = await response.json();
          const newUserId = typeof data.user?.id === 'string' ? data.user.id : null;
          if (newUserId) {
            localStorage.setItem('userId', newUserId);
            storedUserId = newUserId;
          } else {
            console.error('User creation response missing id', data);
          }
        } catch (error) {
          console.error('Failed to create user:', error);
        }
      }
      
      if (storedUserId) {
        setUserId(storedUserId);
      }
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

    setIsUploading(true);
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
      
      if (data.error) {
        alert(data.error);
      } else {
        setAttachments((prev) => [...prev, ...data.attachments]);
      }
    } catch (error) {
      console.error('Failed to upload files:', error);
      alert('Failed to upload files');
    } finally {
      setIsUploading(false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove attachment
  const removeAttachment = (attachmentId: string) => {
    setAttachments((prev) => prev.filter(a => a.id !== attachmentId));
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
                {messages.map((message: any, index) => (
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
                      {/* Attachments */}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {message.attachments.map((attachment: any) => (
                            <a
                              key={attachment.id}
                              href={`/api/attachments/${attachment.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                                message.role === 'user'
                                  ? 'bg-blue-500 text-white hover:bg-blue-400'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                              }`}
                            >
                              {attachment.mimetype.startsWith('image/') ? (
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              ) : (
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              )}
                              <span className="max-w-[100px] truncate">{attachment.filename}</span>
                            </a>
                          ))}
                        </div>
                      )}
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
            <form onSubmit={handleFormSubmit} className="mx-auto max-w-3xl">
              {/* Attachment Chiplets */}
              {attachments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="group relative inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1.5 text-sm text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    >
                      {attachment.mimetype.startsWith('image/') ? (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                      <span className="max-w-[150px] truncate">{attachment.filename}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="ml-1 rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex items-center gap-3">
                {/* File Attachment */}
                <div className="flex items-center gap-2">
                  <label className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:text-blue-300 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <span className="sr-only">Attach files</span>
                    {isUploading ? (
                      <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-5 w-5">
                        <path
                          d="M7.5 11.25l3.79-3.8a1.75 1.75 0 1 1 2.47 2.47l-5.3 5.3a3.25 3.25 0 1 1-4.6-4.6l5.65-5.65"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      multiple
                      accept="image/*,.txt,.csv,.html,.md,.json"
                      onChange={handleFileChange}
                      disabled={isUploading}
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
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
