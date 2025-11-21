'use client';

import type { Dispatch, SetStateAction } from 'react';
import { DEFAULT_SYSTEM_PROMPT_TEXT } from '@/lib/default-system-prompt';
import { FileManager } from '@/components/file-manager';
import type { AgentFormState, ManagedFile, UploadInfo } from '../types';

type AgentPromptFieldsProps = {
  form: AgentFormState;
  setForm: Dispatch<SetStateAction<AgentFormState>>;
  upload: UploadInfo;
  setUpload: (upload: UploadInfo) => void;
  onSystemToolRequired?: () => void;
  fileManagerRefresh?: number;
  onFileManagerMutate?: () => void;
};

export function AgentPromptFields({
  form,
  setForm,
  upload,
  setUpload,
  onSystemToolRequired,
  fileManagerRefresh,
  onFileManagerMutate,
}: AgentPromptFieldsProps) {
  const handleOverrideToggle = (checked: boolean) => {
    if (checked) {
      const ok = confirm(
        'Override the default system prompt for this agent? This changes how the model behaves and enables managing the Current Date/Time tool (enabled by default in each chat).',
      );
      if (!ok) return;
      onSystemToolRequired?.();
    }

    setForm((prev) => ({
      ...prev,
      overrideEnabled: checked,
      overridePrompt: checked && !prev.overridePrompt ? DEFAULT_SYSTEM_PROMPT_TEXT : prev.overridePrompt,
    }));
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-foreground">
        Agent Name
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          placeholder="Give your agent a name"
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
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted">Select a custom instructions document from the file manager (one at a time).</p>
          <FileManager
            selectedIds={upload ? [upload.id] : []}
            onSelect={(file: ManagedFile) => {
              setUpload({ id: file.id, name: file.filename });
              if (typeof file.text_content === 'string' && file.text_content.trim().length > 0) {
                setForm((prev) => ({ ...prev, extraPrompt: file.text_content || prev.extraPrompt }));
              }
            }}
            onDeselect={() => setUpload(null)}
            refreshToken={fileManagerRefresh}
            onMutate={onFileManagerMutate}
            allowEncryptedSelection={false}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={form.overrideEnabled} onChange={(e) => handleOverrideToggle(e.target.checked)} />
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
    </div>
  );
}
