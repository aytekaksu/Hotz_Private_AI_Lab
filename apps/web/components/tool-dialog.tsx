'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ToolGroupList, type SelectableTool } from './tool-group-list';

const GROUP_LABELS: Record<string, string> = {
  'Google Calendar': 'Google Calendar',
  'Google Tasks': 'Google Tasks',
  Notion: 'Notion',
};

export interface ToolDefinition extends SelectableTool {
  description: string;
  category: string;
}

interface ToolDialogProps {
  open: boolean;
  onClose: () => void;
  tools: ToolDefinition[];
  onToggleTool: (toolName: string, enabled: boolean) => void;
}

export function ToolDialog({ open, onClose, tools, onToggleTool }: ToolDialogProps) {
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
                  <ToolGroupList
                    tools={tools}
                    disableToggle={(tool) => !tool.available}
                    onToggleGroup={(_, items, enabled) => {
                      items.forEach((tool) => onToggleTool(tool.toolName, enabled));
                    }}
                    onToggleTool={(tool, enabled) => onToggleTool(tool.toolName, enabled)}
                    groupLabel={(category) => GROUP_LABELS[category] ?? category}
                    defaultOpen
                  />
                </div>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
