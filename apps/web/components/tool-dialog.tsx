'use client';

import { Fragment, useMemo } from 'react';
import { Dialog, Transition, Disclosure } from '@headlessui/react';

const GROUP_LABELS: Record<string, string> = {
  'Google Calendar': 'Google Calendar',
  'Google Tasks': 'Google Tasks',
  Notion: 'Notion',
};

export interface ToolDefinition {
  toolName: string;
  displayName: string;
  description: string;
  category: string;
  authProvider?: string;
  available: boolean;
  enabled: boolean;
}

interface ToolDialogProps {
  open: boolean;
  onClose: () => void;
  tools: ToolDefinition[];
  onToggleTool: (toolName: string, enabled: boolean) => void;
}

export function ToolDialog({ open, onClose, tools, onToggleTool }: ToolDialogProps) {
  const grouped = useMemo(() => {
    const map: Record<string, ToolDefinition[]> = {};
    tools.forEach((tool) => {
      if (!map[tool.category]) {
        map[tool.category] = [];
      }
      map[tool.category].push(tool);
    });
    return map;
  }, [tools]);

  const toggleGroup = (category: string, enabled: boolean) => {
    const items = grouped[category] ?? [];
    items.forEach((tool) => onToggleTool(tool.toolName, enabled));
  };

  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-[60]" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 flex items-start justify-center overflow-y-auto px-4 py-12">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 translate-y-4"
            enterTo="opacity-100 translate-y-0"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-4"
          >
            <Dialog.Panel className="w-full max-w-md rounded-2xl border border-border bg-background shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <Dialog.Title className="text-sm font-semibold text-foreground">Conversation tools</Dialog.Title>
                  <p className="text-xs text-muted">Manage integrations for this thread.</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition hover:text-foreground"
                >
                  <span className="sr-only">Close</span>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path d="M6 6l8 8M14 6l-8 8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              <div className="p-4">
                <div className="space-y-3">
                  {Object.entries(grouped).map(([category, items]) => {
                    const label = GROUP_LABELS[category] ?? category;
                    const enabledCount = items.filter((tool) => tool.enabled).length;
                    const allEnabled = enabledCount === items.length;
                    return (
                      <Disclosure key={category} defaultOpen>
                        {({ open: disclosureOpen }) => (
                          <div className="rounded-xl border border-border bg-surface/70">
                            <Disclosure.Button className="flex w-full items-center justify-between px-4 py-3 text-left">
                              <div>
                                <p className="text-sm font-semibold text-foreground">{label}</p>
                                <p className="text-xs text-muted">
                                  {enabledCount}/{items.length} enabled
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <label className="relative inline-flex h-5 w-9 cursor-pointer items-center">
                                  <input
                                    type="checkbox"
                                    className="peer sr-only"
                                    checked={allEnabled}
                                    onChange={(event) => toggleGroup(category, event.target.checked)}
                                  />
                                  <span className="h-5 w-9 rounded-full bg-border transition peer-checked:bg-accent" />
                                  <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-card transition peer-checked:translate-x-4" />
                                </label>
                                <svg
                                  viewBox="0 0 20 20"
                                  className={`h-4 w-4 text-muted transition-transform ${disclosureOpen ? 'rotate-90' : ''}`}
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
                                  <label
                                    key={tool.toolName}
                                    className={`flex items-start justify-between gap-3 rounded-lg border border-transparent px-3 py-2 transition hover:border-accent/40 ${
                                      tool.available ? '' : 'opacity-60'
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-foreground">{tool.displayName}</p>
                                      <p className="mt-1 text-xs text-muted">{tool.description}</p>
                                      {!tool.available && (
                                        <p className="mt-2 text-xs text-amber-500">
                                          Connect {tool.authProvider} in Settings to enable this tool.
                                        </p>
                                      )}
                                    </div>
                                    <input
                                      type="checkbox"
                                      className="mt-1 h-4 w-4 accent-accent"
                                      checked={tool.enabled}
                                      disabled={!tool.available}
                                      onChange={(event) => onToggleTool(tool.toolName, event.target.checked)}
                                    />
                                  </label>
                                ))}
                              </div>
                            </Disclosure.Panel>
                          </div>
                        )}
                      </Disclosure>
                    );
                  })}
                </div>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
