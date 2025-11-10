'use client';

import type { Dispatch, RefObject, SetStateAction } from 'react';
import { DEFAULT_SYSTEM_PROMPT_TEXT } from '@/lib/default-system-prompt';
import type { AgentFormState, UploadInfo } from '../types';

type AgentPromptFieldsProps = {
  form: AgentFormState;
  setForm: Dispatch<SetStateAction<AgentFormState>>;
  upload: UploadInfo;
  setUpload: (upload: UploadInfo) => void;
  fileRef: RefObject<HTMLInputElement>;
  onUploadFile: (file: File) => void | Promise<void>;
  onSystemToolRequired?: () => void;
};

export function AgentPromptFields({
  form,
  setForm,
  upload,
  setUpload,
  fileRef,
  onUploadFile,
  onSystemToolRequired,
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
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-xs text-muted">
            {upload ? (
              <span>
                Document:{' '}
                <a className="underline" href={`/api/attachments/${upload.id}`} target="_blank" rel="noreferrer">
                  {upload.name}
                </a>
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
              >
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUploadFile(file);
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:text-foreground"
            >
              Upload
            </button>
          </div>
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
