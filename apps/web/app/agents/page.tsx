'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AgentPromptFields } from './_components/agent-prompt-fields';
import { AgentToolSelector } from './_components/agent-tool-selector';
import type { Agent, AgentFormState, ToolItem, UploadInfo } from './types';
import { usePersistentUserId } from '@/lib/hooks/usePersistentUserId';

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

export default function AgentsIndexPage() {
  const router = useRouter();
  const userId = usePersistentUserId();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState<AgentFormState>({
    name: '',
    extraPrompt: '',
    overrideEnabled: false,
    overridePrompt: '',
  });
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [upload, setUpload] = useState<UploadInfo>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [visibleAgentsCount, setVisibleAgentsCount] = useState(20);
  const agentsLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const agentsLoadingRef = useRef(false);

  const loadAgents = useCallback(async () => {
    if (!userId) return;
    const res = await fetch(`/api/agents?userId=${userId}`);
    const data = await res.json();
    setAgents(Array.isArray(data.agents) ? data.agents : []);
  }, [userId]);

  const loadAgentTools = useCallback(
    async (agentId: string) => {
      if (!userId) return;
      const res = await fetch(`/api/agents/${agentId}/tools?userId=${userId}`);
      const data = await res.json();
      const normalized: ToolItem[] = Array.isArray(data.tools) ? data.tools : [];
      setTools(ensureSearchToolPresent(normalized));
    },
    [userId],
  );

  const loadBaseTools = useCallback(async () => {
    if (!userId) return;
    const res = await fetch(`/api/agents/tools?userId=${userId}`);
    const data = await res.json();
    const normalized: ToolItem[] = Array.isArray(data.tools) ? data.tools : [];
    setTools(ensureSearchToolPresent(normalized));
  }, [userId]);

  const ensureSystemToolEnabled = useCallback(() => {
    setTools((prev) => prev.map((t) => (t.toolName === 'get_current_datetime' ? { ...t, enabled: true } : t)));
  }, []);

  useEffect(() => {
    if (userId) {
      void loadAgents();
      void loadBaseTools();
    }
  }, [userId, loadAgents, loadBaseTools]);

  useEffect(() => {
    setVisibleAgentsCount(20);
  }, [agents.length]);

  useEffect(() => {
    agentsLoadingRef.current = false;
  }, [visibleAgentsCount]);

  useEffect(() => {
    if (agents.length <= visibleAgentsCount) return;
    const sentinel = agentsLoadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !agentsLoadingRef.current) {
          agentsLoadingRef.current = true;
          setVisibleAgentsCount((prev) => Math.min(prev + 20, agents.length));
        }
      },
      { root: null, threshold: 0.8 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [agents.length, visibleAgentsCount]);

  const onUploadFile = async (file: File) => {
    const fd = new FormData();
    fd.append('files', file);
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    const data = await res.json();
    const att = Array.isArray(data.attachments) ? data.attachments[0] : null;
    if (att) {
      // Prefer extracted text_content when present
      const extracted = typeof att.text_content === 'string' ? att.text_content : '';
      setForm((prev) => ({ ...prev, extraPrompt: extracted || prev.extraPrompt }));
      setUpload({ id: att.id, name: att.filename });
    }
  };

  const onSave = async () => {
    if (!userId) return;
    setIsSaving(true);
    try {
      let agent = editingAgent;
      if (!agent) {
        // Create first
        const createRes = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, name: form.name.trim() || 'New Agent' }),
        });
        const created = await createRes.json();
        if (created?.agent) {
          agent = created.agent as Agent;
          setEditingAgent(agent);
          // load default tools for toggling
          await loadAgentTools(agent.id);
        }
      }
      if (!agent) return;

      // Update fields
      const patchRes = await fetch(`/api/agents/${agent.id}`, {
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
      const patched = await patchRes.json();
      if (patched?.agent) {
        setEditingAgent(patched.agent);
        // Apply any preselected tool defaults made before creation
        try {
          const selected = tools.filter((t) => t.enabled);
          for (const t of selected) {
            await fetch(`/api/agents/${patched.agent.id}/tools`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ toolName: t.toolName, enabled: true }),
            });
          }
        } catch (e) {
          console.error('Failed to set initial default tools', e);
        }
        await loadAgents();
        await loadAgentTools(patched.agent.id);
      }
      alert('Agent saved');
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

  const createAgentChat = async (agent: Agent) => {
    if (!userId) return;
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
  };

  const deleteAgent = async (agent: Agent) => {
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
      await loadAgents();
    } catch (e) {
      console.error('Failed to delete agent', e);
      alert('Failed to delete agent');
    }
  };

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
          <h1 className="mt-3 truncate text-2xl font-semibold">Agents</h1>
          <p className="mt-1 text-sm text-muted">Create and configure custom agents. Enable default tools and customize behavior.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 rounded-2xl border border-border bg-card/60 p-6 md:grid-cols-2">
        <AgentPromptFields
          form={form}
          setForm={setForm}
          upload={upload}
          setUpload={setUpload}
          fileRef={fileRef}
          onUploadFile={onUploadFile}
          onSystemToolRequired={ensureSystemToolEnabled}
        />
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Default Apps/Tools</h3>
          <p className="text-xs text-muted">Enable tools that should be active by default when chatting with this agent.</p>
          <div className="space-y-3">
            <AgentToolSelector
              tools={tools}
              showSystemCategory={form.overrideEnabled}
              forcedToolNames={form.overrideEnabled ? ['get_current_datetime'] : []}
              disableToggle={(tool) => !tool.available && !!editingAgent}
              onToggleGroup={(_, items, enabled) => {
                if (!editingAgent) {
                  const target = new Set(items.map((item) => item.toolName));
                  setTools((prev) => prev.map((tool) => (target.has(tool.toolName) ? { ...tool, enabled } : tool)));
                } else {
                  items.forEach((tool) => {
                    void toggleAgentTool(editingAgent.id!, tool.toolName, enabled);
                  });
                }
              }}
              onToggleTool={(tool, enabled) => {
                if (!editingAgent) {
                  setTools((prev) => prev.map((t) => (t.toolName === tool.toolName ? { ...t, enabled } : t)));
                } else {
                  void toggleAgentTool(editingAgent.id!, tool.toolName, enabled);
                }
              }}
            />
          </div>

          <div className="pt-2">
            <button
              disabled={isSaving}
              onClick={onSave}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:opacity-50"
            >
              {editingAgent ? 'Save Changes' : 'Create Agent'}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-10 rounded-2xl border border-border bg-card/60 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Existing Agents</h2>
        </div>
        <div className="mt-4 space-y-2">
          {agents.length === 0 ? (
            <p className="text-sm text-muted">No agents yet.</p>
          ) : (
            <>
              {agents.slice(0, visibleAgentsCount).map((a) => (
                <div
                  key={a.id}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-transparent px-3 py-2 transition hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/agents/${a.slug}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      router.push(`/agents/${a.slug}`);
                    }
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      className="text-xs text-accent hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        void createAgentChat(a);
                      }}
                    >
                      New Chat
                    </button>
                    <button
                      type="button"
                      className="text-xs text-muted hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        router.push(`/agents/${a.slug}`);
                      }}
                    >
                      Manage
                    </button>
                    <button
                      className="text-xs text-red-500 hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteAgent(a);
                      }}
                      aria-label={`Delete ${a.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {agents.length > visibleAgentsCount && <div ref={agentsLoadMoreRef} className="h-4" />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
