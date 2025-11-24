import type { Attachment } from '@/lib/db';

export type PublicAttachment = Omit<Attachment, 'path' | 'text_content' | 'encryption_password_hash' | 'failed_attempts'> & {
  text_content?: string | null;
};

type Options = { includeTextContent?: boolean };

const shouldIncludeText = (attachment: Attachment, include?: boolean) => {
  if (!include) return false;
  return !attachment.is_encrypted;
};

export function sanitizeAttachment(attachment?: Attachment | null, options: Options = {}): PublicAttachment | null {
  if (!attachment) return null;
  const { encryption_password_hash, failed_attempts, path, text_content, ...rest } = attachment as Attachment & {
    encryption_password_hash?: string | null;
    failed_attempts?: number;
  };

  const sanitized: PublicAttachment = { ...rest };
  if (shouldIncludeText(attachment, options.includeTextContent) && typeof text_content === 'string') {
    sanitized.text_content = text_content;
  }

  return sanitized;
}

export function sanitizeAttachments(
  attachments: Attachment[] | undefined | null,
  options: Options = {},
): PublicAttachment[] {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((att) => sanitizeAttachment(att, options))
    .filter((att): att is PublicAttachment => !!att);
}
