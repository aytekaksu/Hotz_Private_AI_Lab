'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AgentPromptFields } from '../_components/agent-prompt-fields';
import { AgentToolSelector } from '../_components/agent-tool-selector';
import type { Agent, AgentFormState, ManagedFile, ToolItem, UploadInfo } from '../types';
import { usePersistentUserId } from '@/lib/hooks/usePersistentUserId';
import { FileManager } from '@/components/file-manager';

const ensureSearchToolPresent = (tools: ToolItem[]): ToolItem[] => {
  if (tools.some((t) => t.toolName === 'search_notion')) return tools;
  const notionBaseline = tools.find((t) => t.category === 'Notion' || t.authProvider === 'notion');
  return [
    ...tools,
    {
      toolName: 'search_notion',
      displayName: 'Search Workspace',
      description: 'Search Notion for pages or databases by name to auto-resolve their IDs.',
      category: 'Notion',
      authProvider: 'notion',
      available: notionBaseline?.available ?? true,
      authConnected: notionBaseline?.authConnected ?? true,
      enabled: false,
    },
  ];
};

export default function AgentDetailPage() {
  const params = useParams<{ agent: string }>();
  const slug = params?.agent as string;
  const router = useRouter();
  const userId = usePersistentUserId();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [form, setForm] = useState<AgentFormState>({
    name: '',
    extraPrompt: '',
    overrideEnabled: false,
    overridePrompt: '',
  });
  const [upload, setUpload] = useState<UploadInfo>(null);
  const [agentFiles, setAgentFiles] = useState<ManagedFile[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [fileManagerRefresh, setFileManagerRefresh] = useState(0);
  const [visibleChatCount, setVisibleChatCount] = useState(20);
  const chatsLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const chatsLoadingRef = useRef(false);

  const loadTools = useCallback(
    async (agentId: string) => {
      if (!userId) return;
      const res = await fetch(`/api/agents/${agentId}/tools?userId=${userId}`);
      const data = await res.json();
      const normalized: ToolItem[] = Array.isArray(data.tools) ? data.tools : [];
      setTools(ensureSearchToolPresent(normalized));
    },
    [userId],
  );

  const loadAgentFiles = useCallback(async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/files`);
      const data = await res.json();
      const files: ManagedFile[] = Array.isArray(data.attachments) ? data.attachments : [];
      setAgentFiles(files);
    } catch (e) {
      console.error('Failed to load agent files', e);
    }
  }, []);

  const loadAgents = useCallback(async () => {
    if (!userId) return;
    const res = await fetch(`/api/agents?userId=${userId}`);
    const data = await res.json();
    const list: Agent[] = Array.isArray(data.agents) ? data.agents : [];
    const found = list.find((a) => a.slug === slug) || null;
    setAgent(found);
    if (found) {
      setForm({
        name: found.name,
        extraPrompt: found.extra_system_prompt || '',
        overrideEnabled: !!found.override_system_prompt,
        overridePrompt: found.override_system_prompt || '',
      });
      if (found.instructions_attachment_id && found.instructions_attachment_name) {
        setUpload({ id: found.instructions_attachment_id, name: found.instructions_attachment_name });
      } else {
        setUpload(null);
      }
      await loadAgentFiles(found.id);
      await loadTools(found.id);
    }
  }, [loadTools, loadAgentFiles, slug, userId]);

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    const res = await fetch(`/api/conversations?userId=${userId}`);
    const data = await res.json();
    setConversations(Array.isArray(data.conversations) ? data.conversations : []);
  }, [userId]);

  const ensureSystemToolEnabled = useCallback(() => {
    setTools((prev) => prev.map((t) => (t.toolName === 'get_current_datetime' ? { ...t, enabled: true } : t)));
  }, []);

  const onSelectFile = (file: ManagedFile) => {
    setAgentFiles((prev) => {
      if (prev.some((f) => f.id === file.id)) return prev;
      return [...prev, file];
    });
  };

  const onDeselectFile = (fileId: string) => {
    setAgentFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  useEffect(() => {
    if (userId) {
      void loadAgents();
      void loadConversations();
    }
  }, [userId, loadAgents, loadConversations]);

  const onSave = async () => {
    if (!agent) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          extraSystemPrompt: form.extraPrompt,
          overrideSystemPrompt: form.overrideEnabled ? form.overridePrompt : '',
          instructionsAttachmentId: upload?.id ?? null,
          instructionsAttachmentName: upload?.name ?? null,
        }),
      });
      const data = await res.json();
      if (data?.agent) {
        setAgent(data.agent);
        // slug may change if name changed, so refresh list
        if (data.agent.slug !== slug) router.replace(`/agents/${data.agent.slug}`);
      }
      try {
        await fetch(`/api/agents/${agent.id}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attachmentIds: agentFiles.map((f) => f.id) }),
        });
      } catch (e) {
        console.error('Failed to save agent files', e);
      }
      alert('Agent saved');
      await loadAgents();
    } catch (e) {
      console.error('Failed to save agent', e);
      alert('Failed to save agent');
    } finally {
      setIsSaving(false);
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
      setTools((prev) => prev.map((t) => (t.toolName === toolName ? { ...t, enabled } : t)));
    } catch (e) {
      console.error('Failed to toggle agent tool', e);
      alert('Failed to update tool');
    }
  };

  const createNewChat = async () => {
    if (!agent || !userId) return;
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, agentId: agent.id }),
      });
      const data = await res.json();
      const convId = data?.conversation?.id;
      if (convId) router.push(`/agents/${agent.slug}/${convId}`);
    } catch (e) {
      console.error('Failed to create conversation', e);
    }
  };

  const deleteThisAgent = async () => {
    if (!agent) return;
    const ok = confirm(
      `Delete agent "${agent.name}"? Its default tools will be removed and any chats will become normal chats. This cannot be undone.`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        alert(msg.error || 'Failed to delete agent');
        return;
      }
      router.replace('/agents');
    } catch (e) {
      console.error('Failed to delete agent', e);
      alert('Failed to delete agent');
    }
  };

  const agentConversations = useMemo(() => {
    if (!agent) return [] as any[];
    return conversations.filter((c) => c.agent_id === agent.id);
  }, [conversations, agent]);

  useEffect(() => {
    setVisibleChatCount(20);
  }, [agentConversations.length]);

  useEffect(() => {
    chatsLoadingRef.current = false;
  }, [visibleChatCount]);

  useEffect(() => {
    if (agentConversations.length <= visibleChatCount) return;
    const sentinel = chatsLoadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !chatsLoadingRef.current) {
          chatsLoadingRef.current = true;
          setVisibleChatCount((prev) =>
            Math.min(prev + 20, agentConversations.length),
          );
        }
      },
      { root: null, threshold: 0.8 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [agentConversations.length, visibleChatCount]);

  if (!agent) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <p className="text-sm text-muted">Loading agent…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center">
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
          <h1 className="mt-3 truncate text-2xl font-semibold">{agent.name}</h1>
          <p className="mt-1 text-sm text-muted">Configure this agent and manage its chats.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={createNewChat}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg"
          >New Chat</button>
          <button
            onClick={deleteThisAgent}
            className="inline-flex items-center gap-2 rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 shadow-sm transition hover:bg-red-50"
          >Delete Agent</button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 rounded-2xl border border-border bg-card/60 p-6 md:grid-cols-2">
        <div className="space-y-4">
          <AgentPromptFields
            form={form}
            setForm={setForm}
            upload={upload}
            setUpload={setUpload}
            onSystemToolRequired={ensureSystemToolEnabled}
            fileManagerRefresh={fileManagerRefresh}
            onFileManagerMutate={() => setFileManagerRefresh((v) => v + 1)}
          />

          <div className="pt-2">
            <button
              disabled={isSaving}
              onClick={onSave}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:opacity-50"
            >
              Save Changes
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Default Apps/Tools</h3>
          <p className="text-xs text-muted">Enable tools that should be active by default when chatting with this agent.</p>
          <div className="space-y-3">
            <AgentToolSelector
              tools={tools}
              showSystemCategory={form.overrideEnabled}
              forcedToolNames={form.overrideEnabled ? ['get_current_datetime'] : []}
              disableToggle={(tool) => !tool.available}
              onToggleGroup={(_, items, enabled) => {
                items.forEach((tool) => {
                  void toggleAgentTool(agent.id, tool.toolName, enabled);
                });
              }}
              onToggleTool={(tool, enabled) => {
                void toggleAgentTool(agent.id, tool.toolName, enabled);
              }}
            />
          </div>
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-semibold text-foreground">Default Files</h3>
            <p className="text-xs text-muted">These files will be available to every chat with this agent by default.</p>
            <FileManager
              selectedIds={agentFiles.map((f) => f.id)}
              onSelect={onSelectFile}
              onDeselect={onDeselectFile}
              refreshToken={fileManagerRefresh}
              onMutate={() => setFileManagerRefresh((v) => v + 1)}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card/60 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Chats</h2>
          <button onClick={createNewChat} className="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:text-foreground">New Chat</button>
        </div>
        <div className="mt-4 space-y-2">
          {agentConversations.length === 0 ? (
            <p className="text-sm text-muted">No chats yet.</p>
          ) : (
            <>
              {agentConversations.slice(0, visibleChatCount).map((c) => (
                <a
                  key={c.id}
                  href={`/agents/${agent.slug}/${c.id}`}
                  className="flex items-center justify-between rounded-xl border border-transparent px-3 py-2 text-sm transition hover:border-border"
                >
                  <span className="truncate">{c.title || 'Untitled conversation'}</span>
                  <span className="text-xs text-muted">{new Date(c.updated_at || c.created_at).toLocaleString()}</span>
                </a>
              ))}
              {agentConversations.length > visibleChatCount && <div ref={chatsLoadMoreRef} className="h-4" />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
