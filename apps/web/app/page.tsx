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
import { ThemeToggle } from '@/components/theme-toggle';
import type { ToolDefinition } from '@/components/tool-dialog';

const TOOL_CATEGORIES = ['Google Calendar', 'Google Tasks', 'Notion'] as const;

const formatToolName = (rawName: string) =>
  rawName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getConversationDate = (conversation: any) => {
  const timestamp = conversation?.updated_at || conversation?.created_at;
  return timestamp ? new Date(timestamp) : new Date();
};

const getRecencyLabel = (date: Date, now: Date) => {
  const diff = now.getTime() - date.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return 'Today';
  if (diff < 7 * day) return 'Last 7 Days';
  if (diff < 30 * day) return 'Last 30 Days';
  return 'Older';
};

const formatRelativeDate = (date: Date) => {
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function Home() {
  const [userId, setUserId] = useState<string>('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [availableTools, setAvailableTools] = useState<ToolDefinition[]>([]);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any | null>(null);
  const [agentTools, setAgentTools] = useState<any[]>([]);
  const [agentForm, setAgentForm] = useState<{ name: string; extraPrompt: string; overrideEnabled: boolean; overridePrompt: string }>({ name: '', extraPrompt: '', overrideEnabled: false, overridePrompt: '' });
  const [selectedAgentForNextChat, setSelectedAgentForNextChat] = useState<any | null>(null);
  const [input, setInput] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarInteractionRef = useRef(false);
  // Queue for tool calls that arrive before the assistant message exists
  const pendingToolInvocationsRef = useRef<Array<{ id: string; toolName: string; state: string; args?: any }>>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentConversationIdRef = useRef<string | null>(null);
  const currentAgentSlugRef = useRef<string | null>(null);
  const pendingAttachmentsRef = useRef<any[]>([]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const toolsPopoverRef = useRef<HTMLDivElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarListRef = useRef<HTMLDivElement>(null);

  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      }
      if (!sidebarInteractionRef.current) {
        setSidebarCollapsed(!mobile && window.innerWidth < 1280);
        if (!mobile) {
          const initial = Math.max(260, Math.min(380, window.innerWidth * 0.24));
          setSidebarWidth(initial);
        }
      }
    };
    handler();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) return;
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault();
      const nextWidth = Math.max(240, Math.min(420, event.clientX));
      setSidebarWidth(nextWidth);
    };
    const handleMouseUp = () => {
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
      setIsResizingSidebar(false);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    const initUser = async () => {
      let storedUserId: string | null = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

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
        const normalized: ToolDefinition[] = Array.isArray(data.tools)
          ? data.tools.map((tool: any) => ({
              toolName: tool.toolName,
              displayName: tool.displayName,
              description: tool.description,
              category: tool.category,
              authProvider: tool.authProvider,
              available: !!tool.available,
              enabled: !!tool.enabled,
            }))
          : [];
        setAvailableTools(normalized);
      } catch (error) {
        console.error('Failed to load tools:', error);
      }
    },
    [userId],
  );

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (currentConversationIdRef.current) return currentConversationIdRef.current;
    if (!userId) return null;
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, agentId: selectedAgentForNextChat?.id ?? null }),
      });
      const data = await res.json();
      const convId: string | undefined = data?.conversation?.id;
      if (convId) {
        setCurrentConversationId(convId);
        currentConversationIdRef.current = convId;
        await loadConversations();
        await loadTools(convId);
        return convId;
      }
    } catch (e) {
      console.error('Failed to create conversation for tools', e);
    }
    return null;
  }, [loadConversations, loadTools, selectedAgentForNextChat, userId]);

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
            currentAgentSlugRef.current = agentSlug || null;
          }
          return response;
        },
      }),
    [],
  );

  const { messages, setMessages, sendMessage, status, error, stop } = useChat({
    transport,
    onToolCall: ({ toolCall }) => {
      // Create a tool chip immediately and attach to the latest assistant message
      const toolId = `${(toolCall as any).toolName || (toolCall as any).name || 'tool'}-${Date.now()}`;
      const attachToLastAssistant = () => {
        setMessages((prev) => {
          const idx = prev.map((m) => m.role).lastIndexOf('assistant');
          if (idx === -1) return prev;
          const updated = [...prev];
          const msg = updated[idx] as any;
          const inv = Array.isArray(msg.toolInvocations) ? msg.toolInvocations : [];
          updated[idx] = {
            ...msg,
            toolInvocations: [
              ...inv,
              {
                toolName: (toolCall as any).toolName || (toolCall as any).name || 'tool',
                state: 'running',
                args: (toolCall as any).args,
                id: toolId,
              },
            ],
          };
          return updated;
        });
      };

      const hasAssistant = messages.some((m) => m.role === 'assistant');
      if (hasAssistant) {
        attachToLastAssistant();
      } else {
        pendingToolInvocationsRef.current.push({
          id: toolId,
          toolName: (toolCall as any).toolName || (toolCall as any).name || 'tool',
          state: 'running',
          args: (toolCall as any).args,
        });
      }
    },
    onFinish: async () => {
      // Mark tool chips as completed on the last assistant message
      setMessages((prev) => {
        const lastAssistantIdx = prev.map((m) => m.role).lastIndexOf('assistant');
        if (lastAssistantIdx === -1) return prev;
        const updated = [...prev];
        const msg = updated[lastAssistantIdx] as any;
        if (Array.isArray(msg.toolInvocations)) {
          updated[lastAssistantIdx] = {
            ...msg,
            toolInvocations: msg.toolInvocations.map((inv: any) => ({ ...inv, state: 'output-available' })),
          };
        }
        return updated;
      });

      // Clear queued tool invocations
      pendingToolInvocationsRef.current = [];

      // Refresh side data but avoid replacing message history to prevent flicker
      pendingAttachmentsRef.current = [];
      const convId = currentConversationIdRef.current;
      if (convId) {
        try {
          await loadConversations();
          await loadTools(convId);
        } catch (error) {
          console.error('Post-finish refresh failed:', error);
        }
      }
    },
    onError: (hookError) => {
      console.error('Chat error:', hookError);
      // Mark tool chips as error on the last assistant message
      setMessages((prev) => {
        const lastAssistantIdx = prev.map((m) => m.role).lastIndexOf('assistant');
        if (lastAssistantIdx === -1) return prev;
        const updated = [...prev];
        const msg = updated[lastAssistantIdx] as any;
        if (Array.isArray(msg.toolInvocations)) {
          updated[lastAssistantIdx] = {
            ...msg,
            toolInvocations: msg.toolInvocations.map((inv: any) => ({ ...inv, state: 'output-error' })),
          };
        }
        return updated;
      });
      // Clear queued tool invocations
      pendingToolInvocationsRef.current = [];
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  useEffect(() => {
    if (!composerRef.current) return;
    const el = composerRef.current;
    el.style.height = 'auto';
    el.style.height = `${Math.min(320, el.scrollHeight)}px`;
  }, [input]);

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const form = formRef.current;
      if (form) {
        if (typeof (form as any).requestSubmit === 'function') (form as any).requestSubmit();
        else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  };

  // Persist sidebar scroll position across reloads
  useEffect(() => {
    const el = sidebarListRef.current;
    if (!el) return;
    const key = 'sidebarScrollTop';
    const saved = Number(localStorage.getItem(key) || '0');
    if (!Number.isNaN(saved)) {
      el.scrollTop = saved;
    }
    const onScroll = () => {
      localStorage.setItem(key, String(el.scrollTop));
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed && attachments.length === 0) {
      return;
    }

    const currentAttachments = [...attachments];
    pendingAttachmentsRef.current = currentAttachments;
    setAttachments([]);
    // Clear prompt immediately so it doesn't linger in the field
    setInput('');

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
  // Ensure tools reflect actual conversation state as soon as ID is known
  useEffect(() => {
    if (currentConversationId) {
      void loadTools(currentConversationId);
    }
  }, [currentConversationId, loadTools]);
  // Close tools popover on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!isToolsOpen) return;
      if (
        toolsPopoverRef.current &&
        toolsButtonRef.current &&
        !toolsPopoverRef.current.contains(target) &&
        !toolsButtonRef.current.contains(target)
      ) {
        setIsToolsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isToolsOpen]);

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

  const loadConversation = useCallback(async (conversationId: string) => {
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
        setSidebarOpen(false);
      }
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
  }, [isMobile, loadTools, router, setMessages]);

  const toggleTool = async (toolName: string, enabled: boolean) => {
    if (!userId) return;
    let convId = currentConversationIdRef.current;
    if (!convId) {
      convId = await ensureConversation();
      if (!convId) return;
    }

    try {
      const response = await fetch(`/api/conversations/${convId}/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, toolName, enabled }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to update tool');
        return;
      }

      await loadTools(convId);
    } catch (error) {
      console.error('Failed to toggle tool:', error);
      alert('Failed to update tool');
    }
  };

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
    setAvailableTools([]);
    currentConversationIdRef.current = null;
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

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
  }, [loadConversation, pathname, userId]);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Attach any queued tool invocations to the latest assistant message once it exists
  useEffect(() => {
    if (pendingToolInvocationsRef.current.length === 0) return;
    const lastAssistantIdx = messages.map((m) => m.role).lastIndexOf('assistant');
    if (lastAssistantIdx === -1) return;
    setMessages((prev) => {
      const idx = prev.map((m) => m.role).lastIndexOf('assistant');
      if (idx === -1) return prev;
      const updated = [...prev];
      const msg = updated[idx] as any;
      const existing = Array.isArray(msg.toolInvocations) ? msg.toolInvocations : [];
      updated[idx] = {
        ...msg,
        toolInvocations: [...existing, ...pendingToolInvocationsRef.current],
      };
      return updated;
    });
    pendingToolInvocationsRef.current = [];
  }, [messages, setMessages]);

  const currentConversation = useMemo(
    () =>
      currentConversationId
        ? conversations.find((conv) => conv.id === currentConversationId) ?? null
        : null,
    [conversations, currentConversationId],
  );

  const activeConversationTitle =
    currentConversation?.title ?? (messages.length > 0 ? 'Conversation' : 'New Conversation');

  const groupedConversations = useMemo(() => {
    const now = new Date();
    const filtered = conversations
      .map((conversation) => ({ conversation, date: getConversationDate(conversation) }))
      .filter(({ conversation }) => {
        if (!searchTerm.trim()) return true;
        const title = conversation.title || 'Untitled conversation';
        return title.toLowerCase().includes(searchTerm.trim().toLowerCase());
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    const sections: Record<string, any[]> = {
      Today: [],
      'Last 7 Days': [],
      'Last 30 Days': [],
      Older: [],
    };

    filtered.forEach(({ conversation, date }) => {
      const label = getRecencyLabel(date, now);
      sections[label].push({ ...conversation, date });
    });

    return Object.entries(sections)
      .filter(([, items]) => items.length > 0)
      .map(([label, items]) => ({ label, items }));
  }, [conversations, searchTerm]);

  const conversationList = (
    <aside className="flex h-full w-full flex-col overflow-hidden border-r border-border bg-card/80 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between px-5 pb-3 pt-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.45em] text-muted">Workspace</p>
          <h1 className="mt-1 text-lg font-semibold">Assistant</h1>
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground/70 transition hover:text-foreground"
            aria-label="Close menu"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
              <path d="M6 6l8 8M14 6l-8 8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {!isMobile && (
          <button
            type="button"
            onClick={() => {
              sidebarInteractionRef.current = true;
              setSidebarCollapsed(true);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted transition hover:text-foreground"
            aria-label="Collapse sidebar"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
              <path d="M12.5 5 8 10l4.5 5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      <div className="px-5 pb-4">
        <button
          type="button"
          onClick={startNewChat}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground shadow-sm transition hover:shadow-md"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
            <path d="M10 4.167v11.666M4.167 10h11.666" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          New Chat
        </button>
        <div className="mt-4">
          <label className="group flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted shadow-inner focus-within:border-accent focus-within:text-foreground">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
              <path d="M11.667 11.667 15 15m-1.667-5A4.167 4.167 0 1 0 6 5.833 4.167 4.167 0 0 0 13.333 10" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search conversations"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
            />
          </label>
        </div>
      </div>
      <nav ref={sidebarListRef as any} className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {isLoadingConversations ? (
          <div className="space-y-3 px-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-surface/80" />
            ))}
          </div>
        ) : (
          groupedConversations.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="px-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((conversation: any) => {
                  const isActive = conversation.id === currentConversationId;
                  const title = conversation.title || 'Untitled conversation';
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => loadConversation(conversation.id)}
                      className={`group flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-2 text-left transition ${
                        isActive
                          ? 'border-accent bg-accent/10 text-foreground'
                          : 'hover:border-border hover:bg-surface/80'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="truncate text-sm font-medium">{title}</p>
                        <p className="mt-1 text-xs text-muted">{formatRelativeDate(conversation.date)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteConversation(conversation.id);
                        }}
                        className="hidden rounded-full border border-border p-1 text-muted transition hover:text-foreground group-hover:inline-flex"
                        aria-label="Delete conversation"
                      >
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                          <path d="M6 6l8 8M14 6l-8 8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </nav>
      <div className="border-t border-border/70 px-5 py-5">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">
            <div className="flex items-center justify-between text-sm font-semibold text-foreground">
              Agents
              <button
                type="button"
                onClick={() => {
                  setEditingAgent(null);
                  setAgentForm({ name: '', extraPrompt: '', overrideEnabled: false, overridePrompt: '' });
                  setAgentTools([]);
                  setIsAgentModalOpen(true);
                }}
                className="rounded-full border border-border px-2 py-0.5 text-xs uppercase tracking-[0.3em] text-muted transition hover:border-accent hover:text-foreground"
              >
                New
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {agents.length === 0 ? (
                <p className="text-xs text-muted">No custom agents yet.</p>
              ) : (
                agents.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between rounded-lg border border-transparent px-2 py-1.5 transition hover:border-border">
                    <span className="truncate text-sm text-foreground">{agent.name}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAgentForNextChat(agent);
                          startNewChat();
                        }}
                        className="text-xs font-medium text-accent hover:underline"
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
                        className="text-xs text-muted hover:text-foreground"
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <a
            href="/settings"
            className="flex items-center justify-between rounded-xl border border-border bg-surface/80 px-4 py-3 text-sm text-foreground transition hover:border-accent hover:text-accent"
          >
            Settings
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
              <path d="M8.333 5h-2.5a1.667 1.667 0 0 0 0 3.333h2.5m3.334 0h2.5a1.667 1.667 0 1 1 0 3.334h-2.5M10 5v10" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>
    </aside>
  );

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted">
        Initializing workspace…
      </div>
    );
  }

  const renderMessageText = (message: any) => {
    // Prefer parts if present (streaming often provides parts)
    const pullTextFromArray = (arr: any[]) =>
      arr
        .map((part: any) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object') {
            if (typeof part.text === 'string') return part.text;
            if (typeof part.content === 'string') return part.content;
            if (typeof part.result === 'string') return part.result;
            if (part.type === 'text' && typeof part.text === 'string') return part.text;
          }
          return '';
        })
        .join('')
        .trim();

    if (Array.isArray(message.parts)) {
      const combined = pullTextFromArray(message.parts);
      if (combined.length > 0) return combined;
    }
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      const combined = pullTextFromArray(message.content);
      if (combined.length > 0) return combined;
    }
    if (typeof message.text === 'string') return message.text;
    return '';
  };

  const prettyToolName = (n: any): string => {
    if (typeof n === 'string' && n.trim().length > 0) return formatToolName(n);
    return 'Tool';
  };

  const renderToolChips = (message: any) => {
    const chips: Array<{ name: string; state: string }> = [];

    // From live streaming tool invocations (useChat) - prioritize this
    const inv = (message as any).toolInvocations;
    if (Array.isArray(inv)) {
      for (const i of inv) {
        const name = i.toolName || i.name || 'tool';
        const state = i.state || (i.result ? 'output-available' : 'running');
        chips.push({ name, state });
      }
    }

    // From persisted DB events (parts) - fallback
    if (Array.isArray(message.parts)) {
      for (const part of message.parts) {
        if (typeof part === 'object' && part !== null) {
          const typeStr = typeof part.type === 'string' ? part.type : '';
          const looksLikeTool = /tool/i.test(typeStr) || typeof (part as any).toolName === 'string' || typeof (part as any).name === 'string';
          if (looksLikeTool) {
            const name = (part as any).toolName || (part as any).name || typeStr;
            const state = (part as any).state || ((part as any).result ? 'output-available' : 'running');
            // Only add if not already present from toolInvocations
            if (!chips.some(c => c.name === name)) {
              chips.push({ name: String(name), state: String(state) });
            }
          }
        }
      }
    }

    if (chips.length === 0) return null;

    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {chips.map((c, idx) => (
          <span
            key={`${c.name}-${idx}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
              c.state === 'output-available'
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
                : c.state === 'output-error'
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
                : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                c.state === 'output-available'
                  ? 'bg-green-500'
                  : c.state === 'output-error'
                  ? 'bg-red-500'
                  : 'bg-blue-500 animate-pulse'
              }`}
            />
            {prettyToolName(c.name)}
            <span className="text-[10px] uppercase tracking-[0.2em] font-medium">
              {c.state === 'output-available' ? 'Done' : c.state === 'output-error' ? 'Error' : 'Running'}
            </span>
          </span>
        ))}
      </div>
    );
  };

  

  return (
    <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
      {isMobile ? (
        <>
          {sidebarOpen && (
            <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
          )}
          <div
            className={`fixed inset-y-0 left-0 z-40 w-[min(22rem,90vw)] transform transition-transform duration-200 lg:hidden ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-[110%]'
            }`}
          >
            {conversationList}
          </div>
        </>
      ) : (
        <div
          className="relative hidden h-full lg:flex transition-[width] duration-300"
          style={{ width: sidebarCollapsed ? 20 : sidebarWidth }}
        >
          {sidebarCollapsed ? (
            <div className="flex h-full w-5 items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  sidebarInteractionRef.current = true;
                  setSidebarCollapsed(false);
                }}
                className="inline-flex h-12 w-12 -translate-x-1 items-center justify-center rounded-full border border-border bg-card/80 text-muted shadow transition hover:text-foreground"
                aria-label="Expand sidebar"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-5 w-5">
                  <path d="M7.5 5 12 10l-4.5 5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              {conversationList}
              <div
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent transition hover:bg-accent/40"
                onMouseDown={() => {
                  sidebarInteractionRef.current = true;
                  setIsResizingSidebar(true);
                }}
                role="separator"
                aria-orientation="vertical"
              />
            </>
          )}
        </div>
      )}

      <div className="flex h-full flex-1 min-w-0 flex-col overflow-hidden">

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-10">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            {messages.length === 0 ? (
              <div className="mt-10 rounded-3xl border border-dashed border-border bg-card/60 p-10 text-center shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface text-accent">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-6 w-6">
                    <path d="M5 8.333 10 3.333l5 5M5 11.667 10 16.667l5-5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="mt-6 text-xl font-semibold">Start a conversation</h3>
                <p className="mt-3 text-sm text-muted">
                  Ask about your schedule, manage tasks, or connect your Notion workspace. Your full prompt stays visible below.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message: any, idx: number) => {
                  const isUser = message.role === 'user';
                  const text = renderMessageText(message);
                  const attachmentsForMessage = Array.isArray(message.metadata?.attachments)
                    ? message.metadata.attachments
                    : [];

                  return (
                    <div key={message.id ?? idx} className={`flex w-full ${isUser ? 'justify-end' : 'justify-center'}`}>
                      {isUser ? (
                        <div className="max-w-[80%] rounded-3xl rounded-br-none border border-border bg-card/70 px-5 py-4 shadow-sm backdrop-blur">
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</div>
                          {attachmentsForMessage.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {attachmentsForMessage.map((attachment: any) => (
                                <a
                                  key={attachment.id}
                                  href={`/api/attachments/${attachment.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:text-foreground"
                                >
                                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                                  {attachment.filename}
                                </a>
                              ))}
                            </div>
                          )}
                          {renderToolChips(message)}
                        </div>
                      ) : (
                        <div className="w-full max-w-[90%] md:max-w-[80ch]">
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</div>
                          {attachmentsForMessage.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {attachmentsForMessage.map((attachment: any) => (
                                <a
                                  key={attachment.id}
                                  href={`/api/attachments/${attachment.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:text-foreground"
                                >
                                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                                  {attachment.filename}
                                </a>
                              ))}
                            </div>
                          )}
                          {renderToolChips(message)}
                        </div>
                      )}
                    </div>
                  );
                })}
                {isLoading && (
                  <div className="flex w-full justify-center">
                    <div className="w-full max-w-[90%] md:max-w-[80ch]">
                      <div className="py-2">
                        <span className="inline-flex items-center gap-1 text-xs text-muted" aria-live="polite" aria-label="Waiting for response">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </main>

        <footer className="border-t border-border bg-background/85 px-4 py-6 md:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <form ref={formRef} onSubmit={handleFormSubmit} className="space-y-3">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <span
                      key={attachment.id}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground"
                    >
                      {attachment.filename}
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="text-muted transition hover:text-foreground"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="rounded-3xl border border-border bg-card/80 shadow-sm">
                <textarea
                  ref={composerRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Type your prompt…"
                  className="w-full resize-none rounded-3xl bg-transparent px-5 py-4 text-sm text-foreground placeholder:text-muted focus:outline-none"
                  rows={1}
                  spellCheck={false}
                />
              </div>
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted transition hover:text-foreground">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                    />
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                      <path d="M4.167 10 10 4.167m0 0L15.833 10M10 4.167V15" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Attach
                  </label>
                  <button
                    ref={toolsButtonRef}
                    type="button"
                    onClick={async () => { await ensureConversation(); setIsToolsOpen((v) => !v); }}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                      <path d="M10 4.167v11.666M4.167 10h11.666" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Apps
                  </button>
                  {isToolsOpen && (
                    <div
                      ref={toolsPopoverRef}
                      className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-2xl border border-border bg-background p-3 shadow-xl"
                    >
                      <p className="px-1 pb-2 text-xs text-muted">Conversation apps</p>
                      <div className="space-y-2">
                        {Object.entries(
                          availableTools.reduce((acc: Record<string, ToolDefinition[]>, t) => {
                            (acc[t.category] ||= []).push(t);
                            return acc;
                          }, {}),
                        ).map(([category, items]) => (
                          <details key={category} className="group rounded-xl border border-border bg-surface/60 transition-all">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                              <span className="text-sm font-semibold text-foreground">{category}</span>
                              <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                                {/* slider toggle for entire category */}
                                {(() => {
                                  const togglable = items.filter((t) => t.available);
                                  const allEnabled = togglable.length > 0 && togglable.every((t) => t.enabled);
                                  return (
                                    <label className="relative inline-flex h-5 w-9 cursor-pointer items-center">
                                      <input
                                        type="checkbox"
                                        className="peer sr-only"
                                        checked={allEnabled}
                                        onChange={async (e) => {
                                          const checked = e.target.checked;
                                          for (const t of togglable) {
                                            try { await toggleTool(t.toolName, checked); } catch {}
                                          }
                                        }}
                                      />
                                      <span className="h-5 w-9 rounded-full bg-border transition peer-checked:bg-foreground" />
                                      <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-card transition peer-checked:translate-x-4" />
                                    </label>
                                  );
                                })()}
                                <svg viewBox="0 0 20 20" className="h-4 w-4 text-muted transition-transform group-open:-rotate-90" fill="none" stroke="currentColor">
                                  <path d="M13 5l-6 5 6 5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </div>
                            </summary>
                            <div className="grid grid-rows-[0fr] transition-all duration-300 group-open:grid-rows-[1fr] border-t border-border">
                              <div className="overflow-hidden space-y-2 px-3 py-2">
                                {items.map((tool) => (
                                  <label
                                    key={tool.toolName}
                                    className={`flex items-start justify-between gap-3 rounded-lg border border-transparent px-2 py-1.5 text-sm ${
                                      tool.available ? '' : 'opacity-60'
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate font-medium">{tool.displayName}</p>
                                      <p className="mt-0.5 text-xs text-muted">{tool.description}</p>
                                      {!tool.available && (
                                        <p className="mt-1 text-xs text-muted">Connect {tool.authProvider} to enable.</p>
                                      )}
                                    </div>
                                    <label className="relative inline-flex h-5 w-9 cursor-pointer items-center">
                                      <input
                                        type="checkbox"
                                        className="peer sr-only"
                                        checked={tool.available && tool.enabled}
                                        disabled={!tool.available}
                                        onChange={(event) => toggleTool(tool.toolName, event.target.checked)}
                                      />
                                      <span className="h-5 w-9 rounded-full bg-border transition peer-checked:bg-foreground" />
                                      <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-card transition peer-checked:translate-x-4" />
                                    </label>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isUploading && <span className="text-xs text-muted">Uploading…</span>}
                  {error && !isLoading && (
                    <span className="text-xs text-foreground">{error.message ?? 'An error occurred.'}</span>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoading ? (
                      <>
                        <span className="relative inline-flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-foreground/60" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-foreground" />
                        </span>
                        Sending…
                      </>
                    ) : (
                      <>
                        Send
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                          <path d="M3.333 9.167 16.667 3.333 10.833 16.667 9.167 10.833 3.333 9.167Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </footer>
      </div>

      {isAgentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-10">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.4em] text-muted">Custom agent</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">{editingAgent ? 'Edit Agent' : 'Create Agent'}</h2>
              </div>
              <button
                onClick={() => setIsAgentModalOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted transition hover:text-foreground"
                aria-label="Close agent modal"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid max-h-[70vh] gap-6 overflow-y-auto px-6 py-6 md:grid-cols-2">
              <div className="space-y-4">
                <label className="block text-sm font-medium text-foreground">
                  Name
                  <input
                    type="text"
                    value={agentForm.name}
                    onChange={(event) => setAgentForm((prev) => ({ ...prev, name: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                    placeholder="Give your agent a name"
                  />
                </label>
                <label className="block text-sm font-medium text-foreground">
                  Additional instructions
                  <textarea
                    value={agentForm.extraPrompt}
                    onChange={(event) => setAgentForm((prev) => ({ ...prev, extraPrompt: event.target.value }))}
                    className="mt-2 min-h-[120px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                    placeholder="Add optional guidance for this agent"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={agentForm.overrideEnabled}
                    onChange={(event) => setAgentForm((prev) => ({ ...prev, overrideEnabled: event.target.checked }))}
                  />
                  Override default system prompt
                </label>
                {agentForm.overrideEnabled && (
                  <textarea
                    value={agentForm.overridePrompt}
                    onChange={(event) => setAgentForm((prev) => ({ ...prev, overridePrompt: event.target.value }))}
                    className="mt-2 min-h-[120px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                    placeholder="Provide the full system prompt for this agent"
                  />
                )}
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Default tools</h3>
                <p className="text-xs text-muted">
                  Configure which tools this agent should start with. Changes apply the next time you start a chat with this agent.
                </p>
                <div className="space-y-3">
                  {agentTools.length === 0 ? (
                    <p className="text-xs text-muted">Select an agent to load tool preferences.</p>
                  ) : (
                    agentTools.map((tool) => (
                      <label
                        key={tool.toolName}
                        className="flex items-center justify-between rounded-xl border border-border bg-surface/80 px-3 py-2 text-sm text-foreground"
                      >
                        <span>{tool.displayName}</span>
                        <input
                          type="checkbox"
                          checked={tool.enabled}
                          disabled={!editingAgent}
                          onChange={(event) => {
                            if (!editingAgent) return;
                            toggleAgentTool(editingAgent.id, tool.toolName, event.target.checked);
                          }}
                        />
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border bg-surface/80 px-6 py-4">
              <button
                onClick={() => {
                  setIsAgentModalOpen(false);
                  setEditingAgent(null);
                }}
                className="text-sm font-medium text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={saveAgent}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
