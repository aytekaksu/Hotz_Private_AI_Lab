'use client';

import { Disclosure } from '@headlessui/react';
import { Fragment } from 'react';

export type SelectableTool = {
  toolName: string;
  displayName: string;
  description?: string;
  category?: string;
  enabled: boolean;
  available: boolean;
  authProvider?: string | null;
};

type ToolGroupListProps<T extends SelectableTool> = {
  tools: T[];
  forcedToolNames?: string[];
  disableToggle?: (tool: T) => boolean;
  onToggleGroup: (category: string, items: T[], enabled: boolean) => void | Promise<void>;
  onToggleTool: (tool: T, enabled: boolean) => void | Promise<void>;
  groupLabel?: (category: string) => string;
  shouldHideCategory?: (category: string) => boolean;
  emptyLabel?: string;
  defaultOpen?: boolean;
};

export function ToolGroupList<T extends SelectableTool>({
  tools,
  forcedToolNames = [],
  disableToggle,
  onToggleGroup,
  onToggleTool,
  groupLabel,
  shouldHideCategory,
  emptyLabel = 'No tools or loading…',
  defaultOpen,
}: ToolGroupListProps<T>) {
  const forced = new Set(forcedToolNames);
  const grouped: Record<string, T[]> = {};

  tools.forEach((tool) => {
    const category = tool.category || 'Other';
    if (shouldHideCategory?.(category)) return;
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(tool);
  });

  const sections = Object.entries(grouped);
  if (sections.length === 0) {
    return <div className="text-xs text-muted">{emptyLabel}</div>;
  }

  return (
    <>
      {sections.map(([category, items]) => {
        const enabledCount = items.filter((item) => forced.has(item.toolName) || item.enabled).length;
        const allEnabled = enabledCount === items.length && items.length > 0;
        const label = groupLabel ? groupLabel(category) : category;

        return (
          <Disclosure key={category} as={Fragment} defaultOpen={defaultOpen}>
            {({ open }) => (
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
                        onChange={(event) => {
                          void onToggleGroup(category, items, event.target.checked);
                        }}
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
                    {items.map((tool) => {
                      const checked = forced.has(tool.toolName) ? true : tool.enabled;
                      const disabled = disableToggle?.(tool) ?? false;
                      return (
                        <label
                          key={tool.toolName}
                          className={`flex items-start justify-between gap-3 rounded-lg border border-transparent px-3 py-2 transition hover:border-accent/40 ${
                            tool.available ? '' : 'opacity-60'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{tool.displayName}</p>
                            <p className="mt-1 text-xs text-muted">{tool.description}</p>
                            {!tool.available && tool.authProvider && (
                              <p className="mt-2 text-xs text-amber-500">
                                Connect {tool.authProvider} in Settings to enable this tool.
                              </p>
                            )}
                          </div>
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-accent"
                            checked={checked}
                            disabled={disabled}
                            onChange={(event) => {
                              void onToggleTool(tool, event.target.checked);
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </Disclosure.Panel>
              </div>
            )}
          </Disclosure>
        );
      })}
    </>
  );
}
