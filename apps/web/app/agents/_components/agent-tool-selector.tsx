'use client';

import { ToolGroupList } from '@/components/tool-group-list';
import type { ToolItem } from '../types';

type AgentToolSelectorProps = {
  tools: ToolItem[];
  showSystemCategory: boolean;
  forcedToolNames?: string[];
  disableToggle?: (tool: ToolItem) => boolean;
  onToggleGroup: (category: string, items: ToolItem[], enabled: boolean) => void | Promise<void>;
  onToggleTool: (tool: ToolItem, enabled: boolean) => void | Promise<void>;
  emptyLabel?: string;
};

export function AgentToolSelector({
  tools,
  showSystemCategory,
  forcedToolNames = [],
  disableToggle,
  onToggleGroup,
  onToggleTool,
  emptyLabel = 'No tools or loading…',
}: AgentToolSelectorProps) {
  return (
    <ToolGroupList
      tools={tools}
      forcedToolNames={forcedToolNames}
      disableToggle={disableToggle}
      onToggleGroup={onToggleGroup}
      onToggleTool={onToggleTool}
      shouldHideCategory={(category) => category === 'System' && !showSystemCategory}
      emptyLabel={emptyLabel}
    />
  );
}
