'use client';

import { useEffect, useMemo, useRef, useState, Fragment, useCallback } from 'react';
import { Disclosure } from '@headlessui/react';
import { useRouter, useParams } from 'next/navigation';
import { DEFAULT_SYSTEM_PROMPT_TEXT } from '@/lib/default-system-prompt';

type Agent = {
  id: string;
  name: string;
  slug: string;
  extra_system_prompt?: string | null;
  override_system_prompt?: string | null;
  instructions_attachment_id?: string | null;
  instructions_attachment_name?: string | null;
};

type ToolItem = {
  toolName: string;
  displayName: string;
  description?: string;
  category?: string;
  enabled: boolean;
  available: boolean;
  authProvider?: string | null;
  authConnected?: boolean;
};

export default function AgentDetailPage() {
  const params = useParams<{ agent: string }>();
  const slug = params?.agent as string;
  const router = useRouter();
  const [userId, setUserId] = useState<string>('');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: '',
    extraPrompt: '',
    overrideEnabled: false,
    overridePrompt: '',
  });
  const [upload, setUpload] = useState<{ id: string; name: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [visibleChatCount, setVisibleChatCount] = useState(20);
  const chatsLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const chatsLoadingRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      let storedUserId: string | null = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;
      if (storedUserId) {
        try { const r = await fetch(`/api/users/${storedUserId}`); if (!r.ok) storedUserId = null; } catch { storedUserId = null; }
      }
      if (!storedUserId) {
        const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'user@assistant.local' }) });
        const d = await r.json(); const id = d?.user?.id; if (id) { localStorage.setItem('userId', id); storedUserId = id; }
      }
      if (storedUserId) setUserId(storedUserId);
    };
    void init();
  }, []);

  const loadTools = useCallback(
    async (agentId: string) => {
      if (!userId) return;
      const res = await fetch(`/api/agents/${agentId}/tools?userId=${userId}`);
      const data = await res.json();
      setTools(Array.isArray(data.tools) ? data.tools : []);
    },
    [userId],
  );

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
      await loadTools(found.id);
    }
  }, [loadTools, slug, userId]);

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    const res = await fetch(`/api/conversations?userId=${userId}`);
    const data = await res.json();
    setConversations(Array.isArray(data.conversations) ? data.conversations : []);
  }, [userId]);

  useEffect(() => {
    if (userId) {
      void loadAgents();
      void loadConversations();
    }
  }, [userId, loadAgents, loadConversations]);

  const onUploadFile = async (file: File) => {
    const fd = new FormData();
    fd.append('files', file);
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    const data = await res.json();
    const att = Array.isArray(data.attachments) ? data.attachments[0] : null;
    if (att) {
      const extracted = typeof att.text_content === 'string' ? att.text_content : '';
      setForm((prev) => ({ ...prev, extraPrompt: extracted || prev.extraPrompt }));
      setUpload({ id: att.id, name: att.filename });
    }
  };

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
          <label className="block text-sm font-medium text-foreground">
            Agent Name
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </label>

          <div>
            <label className="block text-sm font-medium text-foreground">Additional Instructions</label>
            <textarea
              value={form.extraPrompt}
              onChange={(e) => setForm((p) => ({ ...p, extraPrompt: e.target.value }))}
              className="mt-2 min-h-[120px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              placeholder="Add optional guidance for this agent"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-xs text-muted">
                {upload ? (
                  <span>
                    Document: <a className="underline" href={`/api/attachments/${upload.id}`} target="_blank" rel="noreferrer">{upload.name}</a>
                  </span>
                ) : (
                  <span>Upload a text/PDF/DOCX to prefill.</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {upload && (
                  <button
                    onClick={() => setUpload(null)}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:text-foreground"
                  >Remove</button>
                )}
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUploadFile(f);
                }} />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:text-foreground"
                >Upload</button>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.overrideEnabled}
              onChange={(e) => {
                const checked = e.target.checked;
                if (checked) {
                  const ok = confirm('Override the default system prompt for this agent? This changes how the model behaves and enables managing the Current Date/Time tool (enabled by default in each chat).');
                  if (!ok) return;
                }
                setForm((p) => ({
                  ...p,
                  overrideEnabled: checked,
                  overridePrompt: checked && !p.overridePrompt ? DEFAULT_SYSTEM_PROMPT_TEXT : p.overridePrompt,
                }));
                if (checked) {
                  // Ensure the system date/time tool is pre-enabled when shown
                  setTools((prev) => prev.map((t) => (t.toolName === 'get_current_datetime' ? { ...t, enabled: true } : t)));
                }
              }}
            />
            Override default system prompt
          </label>
          {form.overrideEnabled && (
            <textarea
              value={form.overridePrompt}
              onChange={(e) => setForm((p) => ({ ...p, overridePrompt: e.target.value }))}
              className="mt-2 min-h-[160px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              placeholder="Provide the full system prompt for this agent"
            />
          )}

          <div className="pt-2">
            <button
              disabled={isSaving}
              onClick={onSave}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:shadow-lg disabled:opacity-50"
            >Save Changes</button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Default Apps/Tools</h3>
          <p className="text-xs text-muted">Enable tools that should be active by default when chatting with this agent.</p>
          <div className="space-y-3">
            {(() => {
              const grouped: Record<string, ToolItem[]> = {};
              tools.forEach((tool) => {
                const cat = tool.category || 'Other';
                if (cat === 'System' && !form.overrideEnabled) return; // hide system unless override enabled
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(tool);
              });
              const toggleGroup = (category: string, enabled: boolean) => {
                (grouped[category] || []).forEach((tool) => toggleAgentTool(agent.id, tool.toolName, enabled));
              };
              const sections = Object.entries(grouped);
              if (sections.length === 0) return <div className="text-xs text-muted">No tools or loading…</div>;
              return sections.map(([category, items]) => {
                const enabledCount = items.filter((t) => t.enabled).length;
                const allEnabled = enabledCount === items.length && items.length > 0;
                return (
                  <Disclosure key={category} as={Fragment}>
                    {({ open }) => (
                      <div className="rounded-xl border border-border bg-surface/70">
                        <Disclosure.Button className="flex w-full items-center justify-between px-4 py-3 text-left">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{category}</p>
                            <p className="text-xs text-muted">{enabledCount}/{items.length} enabled</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="relative inline-flex h-5 w-9 cursor-pointer items-center">
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={allEnabled}
                                onChange={(e) => toggleGroup(category, e.target.checked)}
                              />
                              <span className="h-5 w-9 rounded-full bg-border transition peer-checked:bg-accent" />
                              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-card transition peer-checked:translate-x-4" />
                            </label>
                            <svg
                              viewBox="0 0 20 20"
                              className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-90' : ''}`}
                              fill="none"
                              stroke="currentColor"
                            >
                              <path d="M7 5l6 5-6 5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        </Disclosure.Button>
                        <Disclosure.Panel className="border-t border-border/80 px-4 py-3">
                          <div className="space-y-2">
                            {items.map((tool) => (
                              <label key={tool.toolName} className={`flex items-start justify-between gap-3 rounded-lg border border-transparent px-3 py-2 transition hover:border-accent/40 ${tool.available ? '' : 'opacity-60'}`}>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground">{tool.displayName}</p>
                                  <p className="mt-1 text-xs text-muted">{tool.description}</p>
                                  {!tool.available && (
                                    <p className="mt-2 text-xs text-amber-500">Connect {tool.authProvider} in Settings to enable this tool.</p>
                                  )}
                                </div>
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4 accent-accent"
                                  checked={tool.toolName === 'get_current_datetime' && form.overrideEnabled ? true : tool.enabled}
                                  disabled={!tool.available}
                                  onChange={(e) => toggleAgentTool(agent.id, tool.toolName, e.target.checked)}
                                />
                              </label>
                            ))}
                          </div>
                        </Disclosure.Panel>
                      </div>
                    )}
                  </Disclosure>
                );
              });
            })()}
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
