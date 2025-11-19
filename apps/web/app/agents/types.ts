export type Agent = {
  id: string;
  name: string;
  slug: string;
  extra_system_prompt?: string | null;
  override_system_prompt?: string | null;
  instructions_attachment_id?: string | null;
  instructions_attachment_name?: string | null;
};

export type ToolItem = {
  toolName: string;
  displayName: string;
  description?: string;
  category?: string;
  enabled: boolean;
  available: boolean;
  authProvider?: string | null;
  authConnected?: boolean;
};

export type AgentFormState = {
  name: string;
  extraPrompt: string;
  overrideEnabled: boolean;
  overridePrompt: string;
};

export type UploadInfo = { id: string; name: string } | null;

export type ManagedFile = {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  created_at: string;
  folder_path?: string | null;
  message_id?: string | null;
  is_library?: number | boolean;
  text_content?: string | null;
};
