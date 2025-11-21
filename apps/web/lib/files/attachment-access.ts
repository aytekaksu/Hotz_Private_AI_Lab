import type { Attachment } from '@/lib/db';
import { deleteAttachment, getAttachmentById, incrementAttachmentFailures, resetAttachmentFailures } from '@/lib/db';
import { unzipEncryptedZip } from './encrypted-zip';

export type AttachmentAccessErrorCode = 'password-required' | 'invalid-password' | 'missing-file' | 'unknown';

export class AttachmentAccessError extends Error {
  code: AttachmentAccessErrorCode;
  constructor(code: AttachmentAccessErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const MAX_FAILED_ATTEMPTS = 6;

const enforcePasswordPolicy = async (attachment: Attachment, password?: string) => {
  if (!attachment.is_encrypted) return;
  if (!password) {
    throw new AttachmentAccessError('password-required', 'Password is required to open this file');
  }
  const hash = attachment.encryption_password_hash || '';
  const matches = hash ? await Bun.password.verify(password, hash) : false;
  if (!matches) {
    const attempts = incrementAttachmentFailures(attachment.id);
    if (attempts !== null && attempts >= MAX_FAILED_ATTEMPTS) {
      deleteAttachment(attachment.id);
      throw new AttachmentAccessError('invalid-password', 'File deleted after too many incorrect password attempts');
    }
    throw new AttachmentAccessError(
      'invalid-password',
      attempts !== null ? `Incorrect password. ${Math.max(0, MAX_FAILED_ATTEMPTS - attempts)} attempts left.` : 'Incorrect password',
    );
  }
  resetAttachmentFailures(attachment.id);
};

const readFileBytes = async (path: string): Promise<Uint8Array> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new AttachmentAccessError('missing-file', 'Attachment contents missing on disk');
  }
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
};

export async function readAttachmentBytes(attachment: Attachment, password?: string): Promise<Uint8Array> {
  const fresh = getAttachmentById(attachment.id) || attachment;
  await enforcePasswordPolicy(fresh, password);

  if (fresh.is_encrypted) {
    const zipBytes = await readFileBytes(fresh.path);
    try {
      const { data } = await unzipEncryptedZip(zipBytes, password!);
      return data;
    } catch (error) {
      throw new AttachmentAccessError('invalid-password', 'Incorrect password for encrypted file');
    }
  }
  return readFileBytes(fresh.path);
}
