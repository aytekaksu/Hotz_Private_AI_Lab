'use client';

export const dynamic = 'force-dynamic';

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
  forwardRef,
  type ChangeEvent,
  type FormEvent,
  type HTMLAttributes,
} from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { usePathname, useRouter } from 'next/navigation';
// Theme toggle removed — app is permanently dark
import type { ToolDefinition } from '@/components/tool-dialog';
import { FileManager, type ManagedFile } from '@/components/file-manager';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { uploadWithProgress } from '@/lib/client/upload';

const TOOL_CATEGORIES = ['Google Calendar', 'Google Tasks', 'Notion'] as const;
const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const formatToolName = (rawName: string) =>
  rawName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const parseConversationTimestamp = (timestamp?: string | null) => {
  if (typeof timestamp !== 'string') return null;
  const sanitized = timestamp.trim();
  if (!sanitized) return null;

  const normalized = sanitized.replace(' ', 'T');
  const hasTimeZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);
  const isoLike = hasTimeZone ? normalized : `${normalized}Z`;
  const parsed = new Date(isoLike);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(timestamp);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return parsed;
};

const getConversationDate = (conversation: any) => {
  const timestamp = conversation?.updated_at || conversation?.created_at;
  return parseConversationTimestamp(timestamp) ?? new Date();
};

const getConversationCreatedDate = (conversation: any) => {
  return parseConversationTimestamp(conversation?.created_at) ?? getConversationDate(conversation);
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
  let userTimeZone: string | undefined;
  if (typeof Intl !== 'undefined') {
    try {
      userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      userTimeZone = undefined;
    }
  }
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: userTimeZone,
  });
};

const stripAttachmentAppendix = (message: any, text: string) => {
  if (typeof text !== 'string' || text.length === 0) return '';

  const attachmentsForMessage = Array.isArray(message?.metadata?.attachments)
    ? message.metadata.attachments
    : Array.isArray((message as any)?.attachments)
      ? (message as any).attachments
      : [];

  const markerIndex = text.indexOf('[Attachments]');
  if (markerIndex === -1) return text;

  // Remove everything from the marker onward; keep leading prompt intact
  const trimmed = text.slice(0, markerIndex).trimEnd();

  // If we had attachments or the marker existed, prefer hiding the appendix even if empty
  if (attachmentsForMessage.length > 0) return trimmed;
  // No attachment metadata? still hide the appendix if we found the marker
  return trimmed;
};

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
    if (combined.length > 0) return stripAttachmentAppendix(message, combined);
  }
  if (typeof message.content === 'string') return stripAttachmentAppendix(message, message.content);
  if (Array.isArray(message.content)) {
    const combined = pullTextFromArray(message.content);
    if (combined.length > 0) return stripAttachmentAppendix(message, combined);
  }
  if (typeof message.text === 'string') return stripAttachmentAppendix(message, message.text);
  return '';
};

const MarkdownMessage = memo(({ text }: { text: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      h1: (props) => <h1 className="mt-4 mb-2 text-2xl font-bold" {...props} />,
      h2: (props) => <h2 className="mt-4 mb-2 text-xl font-semibold" {...props} />,
      h3: (props) => <h3 className="mt-3 mb-1.5 text-lg font-semibold" {...props} />,
      p: (props) => <p className="mb-3 whitespace-pre-wrap" {...props} />,
      ul: (props) => <ul className="mb-3 list-disc pl-5 space-y-1" {...props} />,
      ol: (props) => <ol className="mb-3 list-decimal pl-5 space-y-1" {...props} />,
      li: (props) => <li className="leading-relaxed" {...props} />,
      blockquote: (props) => (
        <blockquote className="mb-3 border-l-2 border-border/60 pl-3 italic text-foreground/90" {...props} />
      ),
      a: (props) => <a className="text-accent underline hover:opacity-90" target="_blank" rel="noreferrer" {...props} />,
      code({ className, children, ...props }) {
        const isBlock = typeof className === 'string' && className.includes('language-');
        if (!isBlock) {
          return (
            <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em]" {...props}>
              {children}
            </code>
          );
        }
        return (
          <pre className="mb-3 overflow-x-auto rounded-xl border border-border bg-surface p-3 text-[0.9em]">
            <code className={className} {...props}>
              {children}
            </code>
          </pre>
        );
      },
      hr: (props) => <hr className="my-4 border-border/60" {...props} />,
      table: ({ children }) => (
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[360px] border-collapse text-sm">{children}</table>
        </div>
      ),
      th: (props) => (
        <th className="border border-border/60 bg-surface/70 px-3 py-2 text-left font-semibold" {...props} />
      ),
      td: (props) => <td className="border border-border/60 px-3 py-2 align-top" {...props} />,
    }}
  >
    {text}
  </ReactMarkdown>
));

MarkdownMessage.displayName = 'MarkdownMessage';

// Memoized message row to prevent re-renders of unchanged messages
const MessageRow = memo(({ 
  message, 
  isUser, 
  text, 
  attachments, 
  onOpenAttachment,
  renderToolChips,
}: {
  message: any;
  isUser: boolean;
  text: string;
  attachments: any[];
  onOpenAttachment: (attachment: any) => void;
  renderToolChips: (message: any) => React.ReactNode;
}) => (
  <div className={`mx-auto mb-6 flex w-full max-w-5xl px-4 md:px-10 ${isUser ? 'justify-end' : 'justify-start'}`}>
    {isUser ? (
      <div className="max-w-[90%] rounded-3xl rounded-br-none border border-border bg-card/70 px-5 py-4 shadow-sm backdrop-blur sm:max-w-[80%]">
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</div>
        {attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachments.map((attachment: any) => (
              <a
                key={attachment.id}
                href={`/api/attachments/${attachment.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenAttachment(attachment);
                }}
              >
                {attachment.is_encrypted ? (
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-3 w-3 text-accent">
                    <path d="M6.667 9.167v-2.5a3.333 3.333 0 1 1 6.666 0v2.5m-8.333 0h10V15a1.667 1.667 0 0 1-1.667 1.667H8.333A1.667 1.667 0 0 1 6.667 15V9.167Z" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                )}
                {attachment.filename}
              </a>
            ))}
          </div>
        )}
        {renderToolChips(message)}
      </div>
    ) : (
      <div className="w-full max-w-full md:max-w-[80ch]">
        <div className="text-sm leading-relaxed text-foreground">
          <MarkdownMessage text={text} />
        </div>
        {attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachments.map((attachment: any) => (
              <a
                key={attachment.id}
                href={`/api/attachments/${attachment.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenAttachment(attachment);
                }}
              >
                {attachment.is_encrypted ? (
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-3 w-3 text-accent">
                    <path d="M6.667 9.167v-2.5a3.333 3.333 0 1 1 6.666 0v2.5m-8.333 0h10V15a1.667 1.667 0 0 1-1.667 1.667H8.333A1.667 1.667 0 0 1 6.667 15V9.167Z" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                )}
                {attachment.filename}
              </a>
            ))}
          </div>
        )}
        {renderToolChips(message)}
      </div>
    )}
  </div>
));

MessageRow.displayName = 'MessageRow';

type ChatScrollerProps = HTMLAttributes<HTMLDivElement> & { paddingBottom?: string; paddingTop?: string };

const ChatScroller = forwardRef<HTMLDivElement, ChatScrollerProps>(
  ({ className, style, paddingBottom, paddingTop, ...props }, ref) => (
    <div
      {...props}
      ref={ref}
      className={['w-full box-border pb-4 sm:pb-6 md:pb-6 overflow-x-hidden', className].filter(Boolean).join(' ')}
      style={{
        ...(style || {}),
        paddingBottom: paddingBottom ?? style?.paddingBottom,
        paddingTop: paddingTop ?? style?.paddingTop,
      }}
    />
  ),
);

ChatScroller.displayName = 'ChatScroller';

function ToolsList({
  availableTools,
  onToggle,
}: {
  availableTools: ToolDefinition[];
  onToggle: (toolName: string, enabled: boolean) => Promise<void> | void;
}) {
  return (
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
                          try {
                            await onToggle(t.toolName, checked);
                          } catch { }
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
                  className={`flex items-start justify-between gap-3 rounded-lg border border-transparent px-2 py-1.5 text-sm ${tool.available ? '' : 'opacity-60'
                    }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{tool.displayName}</p>
                    <p className="mt-0.5 text-xs text-muted">{tool.description}</p>
                    {!tool.available && <p className="mt-1 text-xs text-muted">Connect {tool.authProvider} to enable.</p>}
                  </div>
                  <label className="relative inline-flex h-5 w-9 cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={tool.available && tool.enabled}
                      disabled={!tool.available}
                      onChange={(event) => onToggle(tool.toolName, event.target.checked)}
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
  );
}

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
          if (!chips.some(c => c.name === name)) {
            chips.push({ name: String(name), state: String(state) });
          }
        }
      }
    }
  }

  if (chips.length === 0) return null;

  const Icon = ({ state }: { state: string }) => {
    if (state === 'output-available') {
      return (
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-foreground" fill="none" stroke="currentColor">
          <path d="M5 10.5 8.5 14 15 6.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    if (state === 'output-error') {
      return (
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-foreground" fill="none" stroke="currentColor">
          <path d="M6 6 14 14M14 6 6 14" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    }
    // running
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin text-foreground" fill="none" stroke="currentColor">
        <circle className="opacity-20" cx="12" cy="12" r="9" strokeWidth="2" />
        <path className="opacity-80" d="M21 12a9 9 0 0 1-9 9" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.map((c, idx) => (
        <span
          key={`${c.name}-${idx}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-muted hover:text-foreground transition"
          title={`${prettyToolName(c.name)} — ${c.state === 'output-available' ? 'Done' : c.state === 'output-error' ? 'Error' : 'Running'}`}
        >
          <Icon state={c.state} />
          <span className="truncate max-w-[140px]">{prettyToolName(c.name)}</span>
        </span>
      ))}
    </div>
  );
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.download = filename || 'file';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export default function Home() {
  const [userId, setUserId] = useState<string>('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  type ChatAttachment = ManagedFile & {
    addToLibrary?: boolean;
    encryptionPassword?: string;
    uploadState?: 'uploading' | 'error' | null;
    uploadProgress?: number | null;
    tempId?: string;
  };
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [availableTools, setAvailableTools] = useState<ToolDefinition[]>([]);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
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
  const [visibleConversationCount, setVisibleConversationCount] = useState(30);
  const conversationLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const conversationLoadingRef = useRef(false);
  const [visibleSidebarAgentCount, setVisibleSidebarAgentCount] = useState(6);
  const sidebarAgentsContainerRef = useRef<HTMLDivElement | null>(null);
  const sidebarAgentsLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const sidebarAgentsLoadingRef = useRef(false);
  const sidebarInteractionRef = useRef(false);
  // Queue for tool calls that arrive before the assistant message exists
  const pendingToolInvocationsRef = useRef<Array<{ id: string; toolName: string; state: string; args?: any }>>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentConversationIdRef = useRef<string | null>(null);
  const currentAgentSlugRef = useRef<string | null>(null);
  const rootForwardedRef = useRef<boolean>(false);
  const pendingAttachmentsRef = useRef<ChatAttachment[]>([]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const toolsPopoverRef = useRef<HTMLDivElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const fileManagerPopoverRef = useRef<HTMLDivElement>(null);
  const fileManagerButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarListRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isAtBottomRef = useRef(true);
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom;
  }, []);

  const handleIsScrolling = useCallback((scrolling: boolean) => {
    if (scrolling) {
      userScrollingRef.current = true;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    } else {
      // Delay resetting to allow followOutput to stabilize
      scrollTimeoutRef.current = setTimeout(() => {
        userScrollingRef.current = false;
      }, 150);
    }
  }, []);

  // Determine if we should follow output
  const shouldFollowOutput = useCallback(() => {
    // Don't follow if user is actively scrolling away from bottom
    if (userScrollingRef.current && !isAtBottomRef.current) {
      return false;
    }
    return isAtBottomRef.current ? 'smooth' : false;
  }, []);

  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef<string>('');

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    pathnameRef.current = pathname || '';
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
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
      try {
        // Fetch the authenticated user from the session
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        
        if (data.authenticated && data.user?.id) {
          setUserId(data.user.id);
        } else {
          // Not authenticated - redirect to login
          // This shouldn't happen as middleware guards routes, but handle it gracefully
          window.location.href = '/login';
        }
      } catch (error) {
        console.error('Error fetching session:', error);
        window.location.href = '/login';
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

  // Sort agents by latest conversation usage (most recent first)
  const sortedAgentsByUsage = useMemo(() => {
    if (!Array.isArray(agents) || agents.length === 0) return [] as any[];
    const lastUsed: Record<string, number> = {};
    for (const c of conversations) {
      const aid = (c as any).agent_id;
      if (!aid) continue;
      const t = new Date((c as any).updated_at || (c as any).created_at || Date.now()).getTime();
      if (!lastUsed[aid] || t > lastUsed[aid]) lastUsed[aid] = t;
    }
    const copy = [...agents];
    copy.sort((a, b) => (lastUsed[b.id] || 0) - (lastUsed[a.id] || 0));
    return copy;
  }, [agents, conversations]);

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

  const transport = useMemo(() => {
    const baseFetch = globalThis.fetch;
    const instrumentedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await baseFetch(input, init);
      const convId = response.headers.get('X-Conversation-Id');
      const agentSlug = response.headers.get('X-Agent-Slug') || '';
      if (convId && currentConversationIdRef.current !== convId) {
        currentConversationIdRef.current = convId;
        setCurrentConversationId(convId);
        currentAgentSlugRef.current = agentSlug || null;
      }
      return response;
    };
    const fetchWithPreconnect = Object.assign(instrumentedFetch, {
      preconnect:
        typeof (baseFetch as any)?.preconnect === 'function'
          ? (baseFetch as any).preconnect.bind(baseFetch)
          : async (_url: RequestInfo | URL) => { },
    }) as typeof fetch;

    return new DefaultChatTransport({
      api: '/api/chat',
      fetch: fetchWithPreconnect,
    });
  }, []);

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

        // Do not navigate here; URL is handled at creation/click time to avoid interrupting streaming
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
    const safeAttachments = currentAttachments.map(({ encryptionPassword, ...rest }) => rest);
    pendingAttachmentsRef.current = safeAttachments;
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
          attachments: safeAttachments,
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
            attachments: currentAttachments.map((att) => ({
              id: att.id,
              addToLibrary: att.is_library ? false : att.addToLibrary !== false,
              password: att.encryptionPassword,
            })),
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

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!isFileManagerOpen) return;
      if (
        fileManagerPopoverRef.current &&
        fileManagerButtonRef.current &&
        !fileManagerPopoverRef.current.contains(target) &&
        !fileManagerButtonRef.current.contains(target)
      ) {
        setIsFileManagerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isFileManagerOpen]);

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
      const desired = agentSlug
        ? `/agents/${agentSlug}/${conversationId}`
        : `/chat/${conversationId}`;
      if (agentSlug) {
        currentAgentSlugRef.current = agentSlug;
      } else {
        currentAgentSlugRef.current = null;
      }
      if (pathnameRef.current !== desired) {
        router.replace(desired);
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
    // Create a new conversation immediately and navigate to it
    (async () => {
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, agentId: selectedAgentForNextChat?.id ?? null }),
        });
        const data = await res.json();
        const convId: string | undefined = data?.conversation?.id;
        const agentSlug: string | undefined = data?.conversation?.agent_slug;

        setMessages([]);
        setAttachments([]);
        setInput('');
        setAvailableTools([]);

        if (convId) {
          setCurrentConversationId(convId);
          currentConversationIdRef.current = convId;
          const path = agentSlug ? `/agents/${agentSlug}/${convId}` : `/chat/${convId}`;
          router.replace(path);
          if (isMobile) setSidebarOpen(false);
          void loadConversations();
          void loadTools(convId);
        }
      } catch (e) {
        console.error('Failed to create new conversation', e);
      }
    })();
  };

  useEffect(() => {
    if (!userId) return;
    const parts = (pathname || '').split('/').filter(Boolean);
    if (parts.length === 2 && parts[0] === 'chat') {
      const id = parts[1];
      if (id && id !== currentConversationIdRef.current) {
        void loadConversation(id);
      }
    } else if (parts.length === 3 && parts[0] === 'agents') {
      const agentSlug = parts[1];
      const id = parts[2];
      if (agentSlug && id && id !== currentConversationIdRef.current) {
        currentAgentSlugRef.current = agentSlug;
        void loadConversation(id);
      }
    }
  }, [loadConversation, pathname, userId]);

  // On landing at '/', forward to a fresh chat. If the latest chat is empty, reuse it; otherwise create a new one.
  useEffect(() => {
    const parts = (pathname || '').split('/').filter(Boolean);
    if (!userId) return;
    if (parts.length !== 0) return; // only act on root
    if (rootForwardedRef.current) return; // run once
    rootForwardedRef.current = true;

    (async () => {
      try {
        // Fetch fresh conversations list directly to avoid state race
        const listRes = await fetch(`/api/conversations?userId=${userId}`);
        const listData = await listRes.json();
        const list = Array.isArray(listData?.conversations) ? listData.conversations : [];
        const latest = list[0];
        if (latest && latest.id) {
          try {
            const r = await fetch(`/api/conversations/${latest.id}`);
            const d = await r.json();
            const msgs = Array.isArray(d?.messages) ? d.messages : [];
            if (msgs.length === 0) {
              setCurrentConversationId(latest.id);
              currentConversationIdRef.current = latest.id;
              const agentSlug = d?.conversation?.agent_slug || null;
              const url = agentSlug ? `/agents/${agentSlug}/${latest.id}` : `/chat/${latest.id}`;
              router.replace(url);
              return;
            }
          } catch { }
        }
        // Create and forward to a fresh chat
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, agentId: null }),
        });
        const data = await res.json();
        const cid: string | undefined = data?.conversation?.id;
        const slug: string | undefined = data?.conversation?.agent_slug;
        if (cid) {
          setCurrentConversationId(cid);
          currentConversationIdRef.current = cid;
          router.replace(slug ? `/agents/${slug}/${cid}` : `/chat/${cid}`);
        }
      } catch (e) {
        console.error('Failed to forward to fresh chat', e);
      }
    })();
  }, [pathname, userId, router]);

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
    const fileArray = Array.from(files);
    const placeholders: ChatAttachment[] = fileArray.map((file) => {
      const localId = `local-${newId()}`;
      return {
        id: localId,
        tempId: localId,
        filename: file.name,
        mimetype: file.type || 'application/octet-stream',
        size: file.size ?? 0,
        created_at: new Date().toISOString(),
        folder_path: '/',
        is_library: 0,
        uploadState: 'uploading',
        uploadProgress: 0,
        addToLibrary: true,
      };
    });
    setAttachments((prev) => [...prev, ...placeholders]);

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const tempId = placeholders[i].id;
        const formData = new FormData();
        formData.append('files', file);
        formData.append('isLibrary', 'false');
        formData.append('folderPath', '/');

        try {
          const data = await uploadWithProgress<{ error?: string; attachments?: ManagedFile[] }>(
            '/api/uploads',
            formData,
            {
              onProgress: (percent) =>
                setAttachments((prev) =>
                  prev.map((att) =>
                    att.id === tempId ? { ...att, uploadProgress: percent ?? att.uploadProgress } : att,
                  ),
                ),
            },
          );

          if (data?.error) {
            throw new Error(data.error);
          }
          const uploadedList = Array.isArray(data?.attachments) ? (data.attachments as ManagedFile[]) : [];
          const uploaded = uploadedList[0];
          if (!uploaded) {
            throw new Error('Upload response missing attachment');
          }
          const normalized: ChatAttachment = {
            ...(uploaded as ChatAttachment),
            addToLibrary: true,
            uploadState: null,
            uploadProgress: null,
          };
          setAttachments((prev) => prev.map((att) => (att.id === tempId ? normalized : att)));
        } catch (err) {
          console.error('Failed to upload files:', err);
          const message = err instanceof Error ? err.message : 'Failed to upload files';
          alert(message);
          setAttachments((prev) =>
            prev.map((att) =>
              att.id === tempId ? { ...att, uploadState: 'error', uploadProgress: null } : att,
            ),
          );
        }
      }
    } finally {
      setIsUploading(false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const addAttachmentFromLibrary = (attachment: ManagedFile) => {
    let nextAttachment: ChatAttachment = { ...(attachment as ChatAttachment), addToLibrary: false };
    if (attachment.is_encrypted && !attachment.encryptionPassword) {
      const password = prompt(`Enter the password for "${attachment.filename}"`) || '';
      if (!password.trim()) return;
      nextAttachment = { ...nextAttachment, encryptionPassword: password };
    }

    setAttachments((prev) => {
      if (prev.some((a) => a.id === attachment.id)) return prev;
      return [...prev, nextAttachment];
    });
  };

  const deleteAttachmentFromServer = async (attachmentId: string) => {
    try {
      await fetch(`/api/files/${attachmentId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to remove uploaded file', err);
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === attachmentId);
      const isPendingLocal = target?.uploadState === 'uploading' || (target?.tempId && target?.tempId === target?.id);
      if (target && !target.is_library && !isPendingLocal) {
        void deleteAttachmentFromServer(attachmentId);
      }
      return prev.filter((a) => a.id !== attachmentId);
    });
  };

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

  const {
    groupedConversations,
    totalFilteredConversations,
    renderedConversationCount,
  } = useMemo(() => {
    const now = new Date();
    const filtered = conversations
      .map((conversation) => ({
        conversation,
        date: getConversationDate(conversation),
        createdDate: getConversationCreatedDate(conversation),
      }))
      .filter(({ conversation }) => {
        if (!searchTerm.trim()) return true;
        const title = conversation.title || 'Untitled conversation';
        return title.toLowerCase().includes(searchTerm.trim().toLowerCase());
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    const limitedCount = Math.min(visibleConversationCount, filtered.length);
    const limited = filtered.slice(0, limitedCount);

    const sections: Record<string, any[]> = {
      Today: [],
      'Last 7 Days': [],
      'Last 30 Days': [],
      Older: [],
    };

    limited.forEach(({ conversation, date, createdDate }) => {
      const label = getRecencyLabel(date, now);
      sections[label].push({ ...conversation, date, createdDate });
    });

    return {
      groupedConversations: Object.entries(sections)
        .filter(([, items]) => items.length > 0)
        .map(([label, items]) => ({ label, items })),
      totalFilteredConversations: filtered.length,
      renderedConversationCount: limitedCount,
    };
  }, [conversations, searchTerm, visibleConversationCount]);
  const canLoadMoreConversations = renderedConversationCount < totalFilteredConversations;

  useEffect(() => {
    setVisibleConversationCount(30);
  }, [searchTerm, conversations.length]);

  useEffect(() => {
    conversationLoadingRef.current = false;
  }, [visibleConversationCount]);

  useEffect(() => {
    if (!canLoadMoreConversations) return;
    const container = sidebarListRef.current;
    const sentinel = conversationLoadMoreRef.current;
    if (!container || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !conversationLoadingRef.current) {
          conversationLoadingRef.current = true;
          setVisibleConversationCount((prev) =>
            Math.min(prev + 20, totalFilteredConversations),
          );
        }
      },
      { root: container, threshold: 0.75 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMoreConversations, totalFilteredConversations]);

  useEffect(() => {
    setVisibleSidebarAgentCount(6);
  }, [sortedAgentsByUsage.length]);

  useEffect(() => {
    sidebarAgentsLoadingRef.current = false;
  }, [visibleSidebarAgentCount]);

  useEffect(() => {
    if (sortedAgentsByUsage.length <= visibleSidebarAgentCount) return;
    const container = sidebarAgentsContainerRef.current;
    const sentinel = sidebarAgentsLoadMoreRef.current;
    if (!container || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !sidebarAgentsLoadingRef.current) {
          sidebarAgentsLoadingRef.current = true;
          setVisibleSidebarAgentCount((prev) =>
            Math.min(prev + 4, sortedAgentsByUsage.length),
          );
        }
      },
      { root: container, threshold: 0.9 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sortedAgentsByUsage.length, visibleSidebarAgentCount]);

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
          <>
            {groupedConversations.map((group) => (
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
                        className={`group flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-2 text-left transition ${isActive
                          ? 'border-accent bg-accent/10 text-foreground'
                          : 'hover:border-border hover:bg-surface/80'
                          }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{title}</p>
                            {conversation.agent_slug && (
                              <span className="inline-flex items-center rounded-full border border-border px-2 py-[2px] text-[10px] text-muted">
                                Agent: {conversation.agent_name || conversation.agent_slug}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted">
                            {formatRelativeDate(conversation.createdDate ?? conversation.date)}
                          </p>
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
            ))}
            {canLoadMoreConversations && <div ref={conversationLoadMoreRef} className="h-6" />}
          </>
        )}
      </nav>
      <div className="border-t border-border/70 px-5 py-5">
        <div className="space-y-4">
          <div
            className="rounded-xl border border-border bg-surface/60 px-4 py-3 cursor-pointer"
            onClick={() => router.push('/agents')}
            role="button"
            aria-label="Open Agents"
          >
            <div className="flex items-center justify-between text-sm font-semibold text-foreground">
              Agents
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingAgent(null);
                  setAgentForm({ name: '', extraPrompt: '', overrideEnabled: false, overridePrompt: '' });
                  setAgentTools([]);
                  router.push('/agents');
                }}
                className="rounded-full border border-border px-2 py-0.5 text-xs uppercase tracking-[0.3em] text-muted transition hover:border-accent hover:text-foreground"
              >
                New
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">Click to view/manage Agents</p>
            <div ref={sidebarAgentsContainerRef} className="mt-3 max-h-24 space-y-2 overflow-y-auto pr-1">
              {sortedAgentsByUsage.length === 0 ? (
                <p className="text-xs text-muted">No custom agents yet.</p>
              ) : (
                <>
                  {sortedAgentsByUsage.slice(0, visibleSidebarAgentCount).map((agent: any) => (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between rounded-lg border border-transparent px-2 py-1.5 transition hover:border-border"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push('/agents');
                      }}
                    >
                      <span className="truncate text-sm text-foreground">{agent.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const res = await fetch('/api/conversations', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId, agentId: agent.id }),
                              });
                              const data = await res.json();
                              const convId = data?.conversation?.id;
                              if (convId) {
                                router.push(`/agents/${agent.slug}/${convId}`);
                              }
                            } catch (e) {
                              console.error('Failed to create agent chat', e);
                            }
                          }}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          New Chat
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/agents/${agent.slug}`);
                          }}
                          className="text-xs text-muted hover:text-foreground"
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  ))}
                  {sortedAgentsByUsage.length > visibleSidebarAgentCount && (
                    <div ref={sidebarAgentsLoadMoreRef} className="h-4" />
                  )}
                </>
              )}
            </div>
          </div>
          {/* Settings moved to floating pill button */}
        </div>
      </div>
    </aside>
  );

  const VirtuosoHeader = useCallback(() => {
    return <div className={isMobile ? 'h-8' : 'h-16'} />;
  }, [isMobile]);

  const VirtuosoFooter = useCallback(() => {
    return (
      <>
        {isLoading && (
          <div className="mx-auto flex w-full max-w-5xl justify-center pb-6">
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
        <div className={isMobile ? 'h-48 w-full' : 'h-12 w-full'} aria-hidden="true" />
      </>
    );
  }, [isLoading, isMobile]);

  const VirtuosoScroller = useMemo(() => {
    const Component = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>((props, ref) => (
      <ChatScroller {...props} ref={ref} />
    ));
    Component.displayName = 'VirtuosoScroller';
    return Component;
  }, []);

  const virtuosoComponents = useMemo(
    () => ({
      Scroller: VirtuosoScroller,
      Footer: VirtuosoFooter,
      Header: VirtuosoHeader,
    }),
    [VirtuosoScroller, VirtuosoFooter, VirtuosoHeader],
  );

  const handleOpenAttachment = useCallback(async (attachment: any) => {
    if (attachment?.is_encrypted) {
      let lastError: string | null = null;
      while (true) {
        const password: string =
          prompt(
            lastError ? `${lastError}\n\nEnter the password for "${attachment.filename}"` : `Enter the password for "${attachment.filename}"`,
          ) || '';
        if (!password.trim()) return;
        try {
          const res: Response = await fetch(`/api/attachments/${attachment.id}/unlock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          });
          if (!res.ok) {
            const data: any = await res.json().catch(() => ({}));
            const message: string = data.error || 'Unable to open file with that password.';
            if (res.status === 410 || /deleted/i.test(message)) {
              alert(message);
              return;
            }
            lastError = message;
            continue;
          }
          const blob = await res.blob();
          triggerDownload(blob, attachment.filename || 'file');
          return;
        } catch (err) {
          console.error('Failed to open attachment', err);
          alert('Failed to open attachment');
          return;
        }
      }
    } else {
      window.open(`/api/attachments/${attachment.id}`, '_blank', 'noopener,noreferrer');
    }
  }, []);

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted">
        Initializing workspace…
      </div>
    );
  }



  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-background text-foreground">
      <a
        href="/settings"
        className="fixed right-4 top-4 z-50 hidden md:inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-2 text-sm text-foreground shadow transition hover:border-accent hover:text-accent"
        aria-label="Open Settings"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
          <path d="M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" strokeWidth="1.6" />
          <path d="M20 12a7.9 7.9 0 0 0-.2-1.7l1.9-1.1-1.9-3.3-2.2 0.9a7.9 7.9 0 0 0-1.5-1l0.4-2.3h-3.8l0.4 2.3a7.9 7.9 0 0 0-1.5 1l-2.2-0.9L5.3 9.2l1.9 1.1A7.9 7.9 0 0 0 7 12c0 0.6 0.1 1.1 0.2 1.7l-1.9 1.1 1.9 3.3 2.2-0.9a7.9 7.9 0 0 0 1.5 1l-0.4 2.3h3.8l-0.4-2.3a7.9 7.9 0 0 0 1.5-1l2.2 0.9 1.9-3.3-1.9-1.1c0.1-0.6 0.2-1.1 0.2-1.7Z" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Settings
      </a>
      {isMobile ? (
        <>
          {sidebarOpen && (
            <div className="fixed inset-0 z-20 bg-black/50" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
          )}
          <div
            className={`fixed inset-y-0 left-0 z-40 w-[min(22rem,90vw)] transform transition-transform duration-200 lg:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-[110%]'
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

      <div className="flex h-full flex-1 min-w-0 flex-col md:overflow-hidden">
        <header className="flex-none z-30 flex items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-2 text-sm backdrop-blur-md md:hidden">
          <div className="flex flex-1 items-center gap-3 overflow-hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-foreground/80 transition hover:bg-card/40 hover:text-foreground"
              aria-label="Toggle navigation menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6">
                <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground drop-shadow-md" title={activeConversationTitle}>
                {activeConversationTitle}
              </p>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={startNewChat}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground/80 transition hover:bg-card/40 hover:text-accent"
              aria-label="New chat"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-6 w-6">
                <path d="M10 4.167v11.666M4.167 10h11.666" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => router.push('/settings')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground/80 transition hover:bg-card/40 hover:text-foreground"
              aria-label="Open settings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6">
                <path d="M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" strokeWidth="1.6" />
                <path d="M20 12a7.9 7.9 0 0 0-.2-1.7l1.9-1.1-1.9-3.3-2.2.9a7.9 7.9 0 0 0-1.5-1l.4-2.3h-3.8l.4 2.3a7.9 7.9 0 0 0-1.5 1l-2.2-.9L5.3 9.2l1.9 1.1A7.9 7.9 0 0 0 7 12c0 .6.1 1.1.2 1.7l-1.9 1.1 1.9 3.3 2.2-.9a7.9 7.9 0 0 0 1.5 1l-.4 2.3h3.8l-.4-2.3a7.9 7.9 0 0 0 1.5-1l2.2.9 1.9-3.3-1.9-1.1c.1-.6.2-1.1.2-1.7Z" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden min-w-0">
          {messages.length === 0 ? (
            <div
              className="px-4 pb-4 pt-[60px] sm:pb-6 sm:pt-[64px] md:px-10 md:py-6"
              style={{ paddingBottom: isMobile ? '12rem' : undefined }}
            >
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
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
              </div>
            </div>
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              key={currentConversationId ?? 'new'}
              style={{ height: '100%', width: '100%' }}
              data={messages}
              computeItemKey={(idx, message) => message.id ?? `msg-${idx}`}
              followOutput={shouldFollowOutput}
              overscan={400}
              atBottomThreshold={200}
              atBottomStateChange={handleAtBottomStateChange}
              isScrolling={handleIsScrolling}
              initialTopMostItemIndex={messages.length - 1}
              increaseViewportBy={{ top: 400, bottom: 400 }}
              defaultItemHeight={120}
              components={virtuosoComponents}
              itemContent={(idx, message: any) => {
                const isUser = message.role === 'user';
                const text = renderMessageText(message);
                const attachmentsForMessage = Array.isArray(message.metadata?.attachments)
                  ? message.metadata.attachments
                  : Array.isArray((message as any).attachments)
                    ? (message as any).attachments
                    : [];

                return (
                  <MessageRow
                    message={message}
                    isUser={isUser}
                    text={text}
                    attachments={attachmentsForMessage}
                    onOpenAttachment={handleOpenAttachment}
                    renderToolChips={renderToolChips}
                  />
                );
              }}
            />
          )}
        </main>

        <footer
          className={`w-full border-t border-border bg-background/90 px-4 pt-4 sm:px-6 sm:pt-6 md:px-8 ${isMobile ? 'fixed inset-x-0 bottom-0 z-30 shadow-[0_-18px_40px_rgba(0,0,0,0.45)]' : ''}`}
          style={{
            paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
            ...(isMobile ? { backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' } : {}),
          }}
        >
          <div className="mx-auto w-full max-w-4xl">
            <form ref={formRef} onSubmit={handleFormSubmit} className="space-y-3">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment) => {
                    const showLibraryToggle = !attachment.is_library;
                    const isEncrypted = !!attachment.is_encrypted;
                    const isUploadingAttachment = attachment.uploadState === 'uploading';
                    const isUploadError = attachment.uploadState === 'error';
                    return (
                      <span
                        key={attachment.id}
                        className={`inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs text-foreground ${
                          isUploadError ? 'border-red-400/60 bg-red-500/10' : 'border-border'
                        }`}
                      >
                        {isEncrypted ? (
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-3.5 w-3.5 text-accent">
                            <path d="M6.667 9.167v-2.5a3.333 3.333 0 1 1 6.666 0v2.5m-8.333 0h10V15a1.667 1.667 0 0 1-1.667 1.667H8.333A1.667 1.667 0 0 1 6.667 15V9.167Z" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-3.5 w-3.5 text-muted">
                            <path d="M4.167 5.833h6.666L12.5 7.5h3.333v6.667H4.167V5.833Z" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        <span className="truncate max-w-[10rem] sm:max-w-[14rem]">{attachment.filename}</span>
                        {isUploadingAttachment && (
                          <div className="flex items-center gap-1 text-[11px] text-muted">
                            <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-border/60">
                              <div
                                className="h-full bg-accent transition-[width]"
                                style={{ width: `${Math.max(attachment.uploadProgress ?? 10, 5)}%` }}
                              />
                            </div>
                            <span>
                              {attachment.uploadProgress !== null
                                ? `${attachment.uploadProgress}%`
                                : 'Uploading…'}
                            </span>
                          </div>
                        )}
                        {isUploadError && <span className="text-[11px] text-red-300">Failed</span>}
                        {showLibraryToggle && !isUploadingAttachment && !isUploadError && (
                          <label className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted transition hover:text-foreground">
                            <input
                              type="checkbox"
                              className="h-3 w-3"
                              checked={attachment.addToLibrary !== false}
                              onChange={(e) =>
                                setAttachments((prev) =>
                                  prev.map((att) =>
                                    att.id === attachment.id ? { ...att, addToLibrary: e.target.checked } : att,
                                  ),
                                )
                              }
                            />
                            <span>Save to library</span>
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(attachment.id)}
                          className="text-muted transition hover:text-foreground"
                          aria-label={`Remove ${attachment.filename}`}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
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
              <div className="flex flex-wrap items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="flex flex-wrap items-center gap-2">
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
                  <div className="relative">
                    <button
                      ref={toolsButtonRef}
                      type="button"
                      onClick={async () => { await ensureConversation(); setIsFileManagerOpen(false); setIsToolsOpen((v) => !v); }}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                        <path d="M10 4.167v11.666M4.167 10h11.666" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Apps
                    </button>
                    {!isMobile && isToolsOpen && (
                      <div
                        ref={toolsPopoverRef}
                        className="absolute bottom-full left-0 z-20 mb-2 w-80 max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-2xl border border-border bg-background p-3 shadow-xl"
                      >
                        <p className="px-1 pb-2 text-xs text-muted">Conversation apps</p>
                        <ToolsList availableTools={availableTools} onToggle={toggleTool} />
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      ref={fileManagerButtonRef}
                      type="button"
                      onClick={() => { setIsToolsOpen(false); setIsFileManagerOpen((v) => !v); }}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                        <path d="M3.333 14.167V5.833h4.333L9.167 7.5h7.5v6.667h-13.334Z" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Files
                    </button>
                    {!isMobile && isFileManagerOpen && (
                      <div
                        ref={fileManagerPopoverRef}
                        className="absolute bottom-full left-0 z-20 mb-2 w-[26rem] max-h-[calc(100dvh-10rem)] overflow-y-auto"
                      >
                        <FileManager
                          selectedIds={attachments.map((att) => att.id)}
                          onSelect={addAttachmentFromLibrary}
                          onDeselect={removeAttachment}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2 sm:ml-0 sm:gap-3">
                  {isUploading && <span className="text-xs text-muted">Uploading…</span>}
                  {error && !isLoading && (
                    <span className="text-xs text-foreground">{error.message ?? 'An error occurred.'}</span>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:py-2 sm:text-sm"
                  >
                    {isLoading ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center">
                        <span className="h-4 w-4 animate-spin rounded-full border-[1.5px] border-background/40 border-t-background" />
                        <span className="sr-only">Sending</span>
                      </span>
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

      {/* Mobile Popovers */}
      {/* Mobile Popovers */}
      {isMobile && isToolsOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setIsToolsOpen(false)} />
          <div
            ref={toolsPopoverRef}
            className="fixed left-1/2 top-1/2 z-50 max-h-[80dvh] w-[90vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-background p-3 shadow-xl"
          >
            <p className="px-1 pb-2 text-xs text-muted">Conversation apps</p>
            <ToolsList availableTools={availableTools} onToggle={toggleTool} />
          </div>
        </>
      )}
      {isMobile && isFileManagerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setIsFileManagerOpen(false)} />
          <div
            ref={fileManagerPopoverRef}
            className="fixed left-1/2 top-1/2 z-50 max-h-[80dvh] w-[90vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto"
          >
            <FileManager
              selectedIds={attachments.map((att) => att.id)}
              onSelect={addAttachmentFromLibrary}
              onDeselect={removeAttachment}
            />
          </div>
        </>
      )}

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
