'use client';

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { usePathname, useRouter } from 'next/navigation';

const TOOL_CATEGORIES = ['Google Calendar', 'Google Tasks', 'Notion'] as const;

const formatToolName = (rawName: string) =>
  rawName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function Home() {
  const [userId, setUserId] = useState<string>('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(304);
  const [isResizing, setIsResizing] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [availableTools, setAvailableTools] = useState<any[]>([]);
  // Agents state
  const [agents, setAgents] = useState<any[]>([]);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any | null>(null);
  const [agentTools, setAgentTools] = useState<any[]>([]);
  const [agentForm, setAgentForm] = useState<{ name: string; extraPrompt: string; overrideEnabled: boolean; overridePrompt: string }>({ name: '', extraPrompt: '', overrideEnabled: false, overridePrompt: '' });
  const [selectedAgentForNextChat, setSelectedAgentForNextChat] = useState<any | null>(null);
  const [input, setInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingAttachmentsRef = useRef<any[]>([]);
  const currentConversationIdRef = useRef<string | null>(null);
  const currentAgentSlugRef = useRef<string | null>(null);
  const sidebarInitRef = useRef(false);
  const lastMobileRef = useRef<boolean | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateViewport = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);

      if (!sidebarInitRef.current) {
        setIsSidebarCollapsed(mobile);
        sidebarInitRef.current = true;
      } else if (mobile && lastMobileRef.current === false) {
        setIsSidebarCollapsed(true);
      }

      lastMobileRef.current = mobile;
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    const initUser = async () => {
      let storedUserId: string | null = localStorage.getItem('userId');

      if (storedUserId) {
        try {
          const response = await fetch(`/api/users/${storedUserId}`);
          if (!response.ok) {
            localStorage.removeItem('userId');
            storedUserId = null;
          }
        } catch (error) {
          console.error('Error verifying user:', error);
          localStorage.removeItem('userId');
          storedUserId = null;
        }
      }

      if (!storedUserId) {
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

  const loadConversations = useCallback(async () => {
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
  }, [userId]);

  // Load agents for user
  const loadAgents = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/agents?userId=${userId}`);
      const data = await res.json();
      setAgents(Array.isArray(data.agents) ? data.agents : []);
    } catch (e) {
      console.error('Failed to load agents', e);
    }
  }, [userId]);

  const loadTools = useCallback(
    async (conversationId: string | null) => {
      if (!conversationId || !userId) return;

      try {
        const response = await fetch(`/api/conversations/${conversationId}/tools?userId=${userId}`);
        const data = await response.json();
        setAvailableTools(data.tools || []);
      } catch (error) {
        console.error('Failed to load tools:', error);
      }
    },
    [userId],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          const convId = response.headers.get('X-Conversation-Id');
          const agentSlug = response.headers.get('X-Agent-Slug') || '';
          if (convId && currentConversationIdRef.current !== convId) {
            currentConversationIdRef.current = convId;
            setCurrentConversationId(convId);
            // Record agent slug for later navigation; defer heavy work until after streaming finishes
            currentAgentSlugRef.current = agentSlug || null;
          }
          return response;
        },
      }),
    [loadConversations, loadTools, router],
  );

  const { messages, setMessages, sendMessage, status, error, stop } = useChat({
    transport,
    onFinish: () => {
      pendingAttachmentsRef.current = [];
      // After the stream completes, update lists and navigate through Next router (safe now)
      const convId = currentConversationIdRef.current;
      const agentSlug = currentAgentSlugRef.current;
      if (convId) {
        void loadConversations();
        void loadTools(convId);
        const newPath = agentSlug ? `/${agentSlug}/${convId}` : `/chat/${convId}`;
        router.replace(newPath);
      }
    },
    onError: (hookError) => {
      console.error('Chat error:', hookError);
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed && attachments.length === 0) {
      return;
    }

    const currentAttachments = [...attachments];
    pendingAttachmentsRef.current = currentAttachments;
    setAttachments([]);

    requestAnimationFrame(() => {
      setMessages((prev) => {
        if (prev.length === 0) {
          return prev;
        }
        const lastIndex = prev.length - 1;
        const lastMessage = prev[lastIndex];
        if (!lastMessage || lastMessage.role !== 'user') {
          return prev;
        }
        const metadata = {
          ...((lastMessage as any).metadata ?? {}),
          attachments: currentAttachments,
        };
        const updated = [...prev];
        updated[lastIndex] = { ...lastMessage, metadata } as typeof lastMessage;
        return updated;
      });
    });

    try {
      await sendMessage(
        { text: trimmed },
        {
          body: {
            conversationId: currentConversationIdRef.current,
            userId,
            attachments: currentAttachments.map((att) => att.id),
            userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            agentId: !currentConversationIdRef.current && selectedAgentForNextChat ? selectedAgentForNextChat.id : undefined,
          },
        },
      );
      setInput('');
    } catch (err) {
      console.error('Chat error:', err);
      setAttachments(currentAttachments);
      pendingAttachmentsRef.current = [];
    }
  };

  useEffect(() => {
    if (userId) {
      loadConversations();
      loadAgents();
    }
  }, [userId, loadConversations, loadAgents]);

  const mapDbMessageToUiMessage = (message: any) => ({
    id: message.id,
    role: message.role,
    parts: Array.isArray(message.parts) && message.parts.length > 0
      ? message.parts
      : [{ type: 'text', text: message.content ?? '' }],
    content: message.content ?? '',
    metadata: {
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
    },
  });

  const loadConversation = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}`);
      const data = await response.json();
      const history = Array.isArray(data.messages)
        ? data.messages.map(mapDbMessageToUiMessage)
        : [];
      setMessages(history);
      setCurrentConversationId(conversationId);
      currentConversationIdRef.current = conversationId;

      await loadTools(conversationId);

      if (isMobile) {
        setIsSidebarCollapsed(true);
      }
      // Navigate based on joined agent slug if present in response
      const agentSlug = data?.conversation?.agent_slug || null;
      if (agentSlug) {
        currentAgentSlugRef.current = agentSlug;
        router.replace(`/${agentSlug}/${conversationId}`);
      } else {
        currentAgentSlugRef.current = null;
        router.replace(`/chat/${conversationId}`);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const toggleTool = async (toolName: string, enabled: boolean) => {
    if (!currentConversationId || !userId) return;

    try {
      const response = await fetch(`/api/conversations/${currentConversationId}/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, toolName, enabled }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to update tool');
        return;
      }

      await loadTools(currentConversationId);
    } catch (error) {
      console.error('Failed to toggle tool:', error);
      alert('Failed to update tool');
    }
  };

  // Agent APIs
  const createNewAgent = async (name: string) => {
    if (!userId) return null;
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name }),
    });
    const data = await res.json();
    if (data?.agent?.id) {
      await loadAgents();
      return data.agent;
    }
    return null;
  };

  const saveAgent = async () => {
    try {
      if (!editingAgent) {
        const created = await createNewAgent(agentForm.name.trim() || 'New Agent');
        if (created) {
          setEditingAgent(created);
        }
      } else {
        const res = await fetch(`/api/agents/${editingAgent.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: agentForm.name,
            extraSystemPrompt: agentForm.extraPrompt,
            overrideSystemPrompt: agentForm.overrideEnabled ? agentForm.overridePrompt : '',
          }),
        });
        const data = await res.json();
        if (data?.agent) {
          setEditingAgent(data.agent);
          await loadAgents();
        }
      }
      setIsAgentModalOpen(false);
    } catch (e) {
      console.error('Failed to save agent', e);
      alert('Failed to save agent');
    }
  };

  const toggleAgentTool = async (agentId: string, toolName: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName, enabled }),
      });
      if (!res.ok) {
        const msg = await res.json();
        alert(msg.error || 'Failed to update tool');
        return;
      }
      setAgentTools((prev) => prev.map((t) => (t.toolName === toolName ? { ...t, enabled } : t)));
    } catch (e) {
      console.error('Failed to toggle agent tool', e);
      alert('Failed to update tool');
    }
  };

  const startNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setAttachments([]);
    setInput('');
    currentConversationIdRef.current = null;
    if (isMobile) {
      setIsSidebarCollapsed(true);
    }
  };

  // Parse incoming path to open a specific conversation without reload
  useEffect(() => {
    if (!userId) return;
    const parts = (pathname || '').split('/').filter(Boolean);
    if (parts.length === 2 && parts[0] === 'chat') {
      const id = parts[1];
      if (id && id !== currentConversationIdRef.current) {
        void loadConversation(id);
      }
    } else if (parts.length === 2) {
      const [agentSlug, id] = parts;
      if (agentSlug && id && id !== currentConversationIdRef.current) {
        currentAgentSlugRef.current = agentSlug;
        void loadConversation(id);
      }
    }
  }, [pathname, userId]);

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

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
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

  const removeAttachment = (attachmentId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  };

  const handleMouseDown = () => {
    if (isMobile) return;
    setIsResizing(true);
  };

  useEffect(() => {
    if (isMobile) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth >= 240 && newWidth <= 420) {
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
  }, [isResizing, isMobile]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const currentConversation = useMemo(
    () =>
      currentConversationId
        ? conversations.find((conv) => conv.id === currentConversationId) ?? null
        : null,
    [conversations, currentConversationId],
  );

  const activeConversationTitle =
    currentConversation?.title ?? (messages.length > 0 ? 'Conversation' : 'New Conversation');

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="rounded-2xl border border-white/10 bg-slate-900 px-6 py-4 text-sm font-medium text-white/70">
          Initializing workspace…
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">

      {isMobile && !isSidebarCollapsed && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/75 transition-opacity duration-150"
          aria-hidden="true"
          onClick={() => setIsSidebarCollapsed(true)}
        />
      )}

      <div className="relative z-40 flex h-screen w-full overflow-hidden">
        <aside
          className={`${
            isMobile
              ? 'fixed inset-x-4 top-4 z-40 flex h-[calc(100vh-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 transition-transform duration-150 ease-out'
              : 'hidden h-full flex-col overflow-hidden border-r border-white/10 bg-slate-900 transition-[width,opacity] duration-150 lg:flex'
          } ${isSidebarCollapsed ? (isMobile ? 'translate-y-[110%] opacity-0' : 'opacity-0 pointer-events-none') : (isMobile ? 'translate-y-0 opacity-100' : 'opacity-100')}`}
          style={
            isMobile
              ? undefined
              : isSidebarCollapsed
                ? { width: 0 }
                : { width: sidebarWidth, minWidth: 260, maxWidth: 420 }
          }
        >
          <div className="flex h-full flex-col gap-6 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Navigator</p>
                <h1 className="mt-2 text-2xl font-semibold text-white">AI Assistant</h1>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                aria-label="Collapse sidebar"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path
                    d="M12.5 5.5l-5 4.5 5 4.5"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <button
              type="button"
              onClick={startNewChat}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition duration-150 hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-3 w-3">
                  <path
                    d="M10 4.5v11m5.5-5.5h-11"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              Start a new thread
            </button>

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Recent</p>
                <span className="text-[11px] uppercase tracking-[0.3em] text-white/30">
                  {conversations.length} chats
                </span>
              </div>
              {isLoadingConversations ? (
                <div className="mt-6 space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-14 animate-pulse rounded-xl bg-white/5" />
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-6 text-sm text-white/60">
                  No conversations yet. Start something fresh above.
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {conversations.map((conv) => {
                    const isActive = currentConversationId === conv.id;
                    return (
                      <div
                        key={conv.id}
                        className={`group flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors duration-150 hover:border-blue-400/40 hover:bg-white/[0.06] ${
                          isActive ? 'border-blue-400/60 bg-white/[0.08]' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => loadConversation(conv.id)}
                          className="flex-1 truncate text-left text-sm font-medium text-white/90 transition hover:text-white"
                        >
                          <span className="truncate">{conv.title}</span>
                          {conv.agent_name && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/70">
                              {conv.agent_name}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteConversation(conv.id)}
                          className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-white/40 transition hover:border-red-500/50 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                          aria-label="Delete conversation"
                        >
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                            <path
                              d="M6 6l8 8M14 6l-8 8"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Agents */}
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Agents</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingAgent(null);
                    setAgentForm({ name: '', extraPrompt: '', overrideEnabled: false, overridePrompt: '' });
                    setAgentTools([]);
                    setIsAgentModalOpen(true);
                  }}
                  className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-white/80 transition duration-150 hover:border-blue-400/50 hover:text-white"
                >
                  + New
                </button>
              </div>
              {agents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/5 px-3 py-3 text-xs text-white/60">
                  No agents yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {agents.map((agent) => (
                    <div key={agent.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="min-w-0 flex-1 truncate text-sm text-white/85">{agent.name}</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAgentForNextChat(agent);
                            startNewChat();
                          }}
                          className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/80 transition duration-150 hover:border-blue-400/50 hover:text-white"
                        >
                          Chat
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setEditingAgent(agent);
                            setAgentForm({
                              name: agent.name,
                              extraPrompt: agent.extra_system_prompt || '',
                              overrideEnabled: !!agent.override_system_prompt,
                              overridePrompt: agent.override_system_prompt || '',
                            });
                            try {
                              const res = await fetch(`/api/agents/${agent.id}/tools?userId=${userId}`);
                              const data = await res.json();
                              setAgentTools(Array.isArray(data.tools) ? data.tools : []);
                            } catch (e) {
                              console.error('Failed to load agent tools', e);
                              setAgentTools([]);
                            }
                            setIsAgentModalOpen(true);
                          }}
                          className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/80 transition duration-150 hover:border-blue-400/50 hover:text-white"
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <a
              href="/settings"
              className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/80 transition duration-150 hover:border-blue-400/50 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition group-hover:border-blue-400/50 group-hover:bg-white/10">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-5 w-5">
                  <path
                    d="M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-4.5v2m0 12v2M3.5 10h-2m17 0h-2M5.05 5.05 3.64 3.64m12.72 12.72-1.41-1.41m1.41-9.9-1.41 1.41m-9.9 9.9-1.41 1.41"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              Settings
            </a>
          </div>
        </aside>

        {!isMobile && !isSidebarCollapsed && (
          <div
            className="hidden h-full w-2 cursor-col-resize bg-white/10 transition hover:bg-white/20 lg:block"
            onMouseDown={handleMouseDown}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
          />
        )}

        <main className="relative flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-slate-950/95 px-4 py-4 sm:px-6 lg:px-10">
            <div className="flex items-center gap-3">
              {isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition duration-150 hover:border-blue-400/50 hover:text-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  aria-label="Open conversation menu"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-5 w-5">
                    <path
                      d="M3.5 5h13m-13 5h13m-13 5h13"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Now chatting</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{activeConversationTitle}</h2>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-white/40">
              {isLoading ? (
                <>
                  <span className="relative inline-flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400/80"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400"></span>
                  </span>
                  Thinking
                </>
              ) : (
                <>
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400"></span>
                  Ready
                </>
              )}
            </div>
          </header>

          <div className="relative flex-1 overflow-y-auto px-4 pb-40 pt-6 sm:px-6 lg:px-10">
            {error && (
              <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
                <div className="flex items-start gap-3">
                  <svg className="h-5 w-5 flex-shrink-0 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-red-100">Something went wrong</p>
                    <p className="mt-1 text-sm text-red-200/90">
                      {error.message || 'An error occurred while processing your request.'}
                    </p>
                    {error.message?.includes('limit exceeded') && (
                      <p className="mt-2 text-xs text-red-200">
                        Please update your OpenRouter API key in Settings.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-xl rounded-2xl border border-white/10 bg-white/5 px-8 py-10 text-center">
                  <h2 className="text-2xl font-semibold text-white">Welcome to your control center</h2>
                  <p className="mt-3 text-sm text-white/70">
                    Ask about your calendar, streamline tasks, or shape your Notion spaces. Attach files for extra
                    context and let the assistant orchestrate it all.
                  </p>
                  <div className="mt-6 grid gap-3 text-left text-sm text-white/70">
                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      “Summarize my upcoming meetings and flag any conflicts.”
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      “Capture action items from this doc and add them to tasks.”
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      “Draft a Notion update for the launch checklist.”
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
                {messages.map((message: any, index) => {
                  const messageKey = message.id ?? index;
                  const textFromParts = (parts: any[]): string => {
                    if (!Array.isArray(parts)) return '';
                    let out = '';
                    let startNewline = false;
                    for (const p of parts) {
                      if (!p || typeof p !== 'object') continue;
                      if (p.type === 'text') {
                        const t = typeof p.text === 'string' ? p.text : '';
                        if (t && startNewline && out.length > 0) out += '\n\n';
                        out += t;
                        startNewline = false;
                      } else if (
                        typeof p.type === 'string' &&
                        (p.type === 'dynamic-tool' || p.type.startsWith('tool-'))
                      ) {
                        startNewline = true;
                      }
                    }
                    return out;
                  };
                  const messageText = (() => {
                    if (Array.isArray(message.parts)) {
                      const txt = textFromParts(message.parts);
                      if (txt && txt.length > 0) return txt;
                    }
                    return typeof message.content === 'string' ? message.content : '';
                  })();
                  const toolParts = Array.isArray(message.parts)
                    ? message.parts.filter(
                        (part: any) =>
                          typeof part.type === 'string' &&
                          (part.type === 'dynamic-tool' || part.type.startsWith('tool-')),
                      )
                    : [];
                  const visibleToolParts = toolParts.filter((part: any) => {
                    const toolName =
                      part.type === 'dynamic-tool'
                        ? part.toolName
                        : part.type.replace(/^tool-/, '');
                    return toolName !== 'get_current_datetime';
                  });
                  const attachmentsList = Array.isArray(message.metadata?.attachments)
                    ? message.metadata.attachments
                    : Array.isArray(message.attachments)
                      ? message.attachments
                      : [];

                  if (message.role === 'user') {
                    return (
                      <div key={messageKey} className="flex justify-end">
                        <div className="w-full max-w-[min(78%,28rem)] rounded-2xl bg-blue-600 px-5 py-4 text-base text-white transition-transform duration-150 hover:translate-y-[-1px]">
                          {attachmentsList.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-2">
                              {attachmentsList.map((attachment: any) => (
                                <a
                                  key={attachment.id}
                                  href={`/api/attachments/${attachment.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition duration-150 hover:border-white/40 hover:bg-white/20"
                                >
                                  {attachment.mimetype.startsWith('image/') ? (
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.6}
                                        d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2 1.586-1.586a2 2 0 0 1 2.828 0L20 14m-6-6h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"
                                      />
                                    </svg>
                                  ) : (
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.6}
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"
                                      />
                                    </svg>
                                  )}
                                  <span className="max-w-[120px] truncate">{attachment.filename}</span>
                                </a>
                              ))}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap leading-7">{messageText}</div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={messageKey} className="flex items-start gap-3">
                      <div className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[11px] font-semibold uppercase tracking-[0.3em] text-white">
                        AI
                      </div>
                      <div className="flex-1 space-y-4">
                        <div className="whitespace-pre-wrap text-base leading-7 text-white/90">{messageText}</div>

                        {attachmentsList.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {attachmentsList.map((attachment: any) => (
                              <a
                                key={attachment.id}
                                href={`/api/attachments/${attachment.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition duration-150 hover:border-blue-400/40 hover:bg-blue-500/10"
                              >
                                {attachment.mimetype.startsWith('image/') ? (
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.6}
                                      d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2 1.586-1.586a2 2 0 0 1 2.828 0L20 14m-6-6h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"
                                    />
                                  </svg>
                                ) : (
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.6}
                                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"
                                    />
                                  </svg>
                                )}
                                <span className="max-w-[140px] truncate">{attachment.filename}</span>
                              </a>
                            ))}
                          </div>
                        )}

                        {visibleToolParts.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="uppercase tracking-[0.15em] text-white/40 mr-1">tools</span>
                            {visibleToolParts.map((part: any, toolIndex: number) => {
                              const rawName = part.type === 'dynamic-tool' ? part.toolName : part.type.replace(/^tool-/, '');
                              const displayName = formatToolName(rawName);
                              const state = part.state;
                              const isCompleted = state === 'output-available';
                              const isError = state === 'output-error';
                              const statusLabel = isError ? 'Failed' : isCompleted ? (part.preliminary ? 'Preliminary' : 'Completed') : 'Running';
                              const dot = isError ? 'bg-red-400' : isCompleted ? 'bg-emerald-400' : 'bg-blue-400';
                              return (
                                <span
                                  key={toolIndex}
                                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/80"
                                  title={`${displayName} — ${statusLabel}${part.errorText ? `: ${part.errorText}` : ''}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                                  <span className="truncate max-w-[140px]">{displayName}</span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0">
            <div className="pointer-events-auto px-4 pb-6 sm:px-6 lg:px-10">
              <form
                onSubmit={handleFormSubmit}
                className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/95 p-4"
              >
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="group inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80"
                      >
                        {attachment.mimetype.startsWith('image/') ? (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.6}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2 1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.6}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        )}
                        <span className="max-w-[150px] truncate">{attachment.filename}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(attachment.id)}
                          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-transparent text-white/50 transition duration-150 hover:border-red-500/40 hover:text-red-200"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                  <div className="flex items-center gap-2">
                    <label
                      className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition duration-150 ${
                        isUploading ? 'cursor-not-allowed opacity-50' : 'hover:border-blue-400/60 hover:text-blue-100'
                      }`}
                    >
                      <span className="sr-only">Attach files</span>
                      {isUploading ? (
                        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
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

                    <button
                      type="button"
                      onClick={() => {
                        if (currentConversationId) {
                          loadTools(currentConversationId);
                          setIsToolsModalOpen(true);
                        }
                      }}
                      disabled={!currentConversationId}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition duration-150 hover:border-blue-400/60 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-haspopup="dialog"
                      aria-expanded={isToolsModalOpen}
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

                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 focus-within:border-blue-400/60 focus-within:ring-1 focus-within:ring-blue-500/40">
                    <input
                      type="text"
                      placeholder="Prompt the assistant..."
                      className="h-10 w-full bg-transparent text-base text-white placeholder-white/40 focus:outline-none"
                      value={input}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => stop()}
                      disabled={!isLoading}
                      className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition duration-150 hover:border-red-400/60 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Stop
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || (!input.trim() && attachments.length === 0)}
                      className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition duration-150 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>

      {isToolsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Conversation</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Tool Access</h2>
              </div>
              <button
                onClick={() => setIsToolsModalOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition duration-150 hover:border-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                aria-label="Close tools"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto px-6 py-6">
              {availableTools.length === 0 ? (
                <p className="text-center text-sm text-white/60">Loading tools...</p>
              ) : (
                <div className="space-y-6">
                  {TOOL_CATEGORIES.map((category) => {
                    const categoryTools = availableTools.filter((tool: any) => tool.category === category);
                    if (categoryTools.length === 0) return null;

                    return (
                      <div key={category} className="space-y-3">
                        <h3 className="text-sm font-semibold text-white/80">{category}</h3>
                        <div className="space-y-2">
                          {categoryTools.map((tool: any) => (
                            <div
                              key={tool.toolName}
                              className={`flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 transition duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 ${
                                tool.available ? '' : 'opacity-60'
                              }`}
                            >
                              <label className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center">
                                <input
                                  type="checkbox"
                                  className="peer sr-only"
                                  checked={tool.enabled}
                                  disabled={!tool.available}
                                  onChange={(e) => toggleTool(tool.toolName, e.target.checked)}
                                />
                                <span className="h-6 w-11 rounded-full bg-white/10 transition-colors duration-150 peer-checked:bg-blue-500/70 peer-disabled:bg-white/5"></span>
                                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-150 peer-checked:translate-x-5 peer-disabled:bg-white/40"></span>
                              </label>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-white">
                                    {tool.displayName}
                                  </span>
                                  {tool.authConnected ? (
                                    <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-100">
                                      Connected
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/60">
                                      Not Connected
                                    </span>
                                  )}
                                </div>
                                <p className="mt-2 text-sm text-white/70">{tool.description}</p>
                                {!tool.available && (
                                  <p className="mt-2 text-xs text-orange-200">
                                    Please connect your {tool.authProvider} account in Settings to use this tool.
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-white/10 bg-white/5 px-6 py-4">
              <button
                onClick={() => setIsToolsModalOpen(false)}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition duration-150 hover:bg-blue-500"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Modal */}
      {isAgentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Agents</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{editingAgent ? 'Edit Agent' : 'New Agent'}</h2>
              </div>
              <button
                onClick={() => setIsAgentModalOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition duration-150 hover:border-white/20 hover:text-white"
                aria-label="Close agent"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase tracking-[0.2em] text-white/50">Name</label>
                    <input
                      type="text"
                      value={agentForm.name}
                      onChange={(e) => setAgentForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g., Research Assistant"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-[0.2em] text-white/50">Base System Prompt (locked)</label>
                    <textarea
                      readOnly
                      value={`You are a helpful AI assistant.\n\nThis base instruction will be combined with time/context and safe tool-usage guidance during runtime.`}
                      className="mt-1 h-28 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white/70"
                    />
                    <div className="mt-2 text-[11px] text-white/50">
                      Changing the base prompt can significantly alter behavior. Prefer adding an extra prompt below.
                    </div>
                    <label className="mt-3 inline-flex items-center gap-2 text-sm text-white/80">
                      <input
                        type="checkbox"
                        checked={agentForm.overrideEnabled}
                        onChange={(e) => setAgentForm((p) => ({ ...p, overrideEnabled: e.target.checked }))}
                      />
                      I understand the risks; override base system prompt
                    </label>
                    <textarea
                      disabled={!agentForm.overrideEnabled}
                      value={agentForm.overridePrompt}
                      onChange={(e) => setAgentForm((p) => ({ ...p, overridePrompt: e.target.value }))}
                      placeholder="Custom base system prompt (optional)"
                      className="mt-2 h-28 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-[0.2em] text-white/50">Extra System Prompt</label>
                    <textarea
                      value={agentForm.extraPrompt}
                      onChange={(e) => setAgentForm((p) => ({ ...p, extraPrompt: e.target.value }))}
                      placeholder="Add extra guidance. This will be appended to the base system prompt."
                      className="mt-1 h-28 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-semibold text-white">Default Tools</div>
                  {agentTools.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-white/60">{editingAgent ? 'Loading tools…' : 'Create the agent to configure tools.'}</div>
                  ) : (
                    <div className="space-y-2">
                      {agentTools.map((tool) => (
                        <div key={tool.toolName} className={`flex items-start gap-3 rounded-xl border p-3 ${tool.available ? 'border-white/10 bg-white/5' : 'border-white/10 bg-white/[0.03] opacity-60'}`}>
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4"
                            checked={tool.enabled}
                            disabled={!tool.available}
                            onChange={(e) => toggleAgentTool(editingAgent!.id, tool.toolName, e.target.checked)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm text-white">{tool.displayName}</div>
                              {!tool.available && (
                                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">Requires {tool.authProvider}</span>
                              )}
                            </div>
                            <div className="text-xs text-white/60">{tool.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 bg-white/5 px-6 py-4">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setIsAgentModalOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={saveAgent}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
