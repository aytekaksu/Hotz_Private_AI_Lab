import { NextRequest } from 'next/server';
import { createAttachment, getAttachmentFolderByPath, normalizeFolderPath } from '@/lib/db';
import { nanoid } from 'nanoid';
import { hashPassword } from '@/lib/encryption';
import { createEncryptedZip } from '@/lib/files/encrypted-zip';
import { extractTextFromBytes, shouldStreamTextContent } from '@/lib/files/text-extraction';

export const runtime = 'nodejs';

const LOCAL_UPLOADS_DIR = Bun.fileURLToPath(
  new URL('./data/uploads/', Bun.pathToFileURL(process.cwd() + '/')),
);

const toDirectoryUrl = (dir: string) => Bun.pathToFileURL(dir.endsWith('/') ? dir : `${dir}/`);

const resolveUploadDir = () =>
  process.env.DATABASE_URL?.includes('/data/') ? '/data/uploads' : LOCAL_UPLOADS_DIR;

const getExtension = (filename: string) => {
  const normalized = filename?.split(/[\\/]/).pop() ?? '';
  if (!normalized) {
    return '';
  }
  const lastDot = normalized.lastIndexOf('.');
  return lastDot > 0 ? normalized.slice(lastDot) : '';
};

// Allowed file types
const ALLOWED_MIMETYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const folderInput = formData.get('folderPath');
    const isLibraryInput = formData.get('isLibrary');
    const encryptedInput = formData.get('encrypted');
    const encryptionPasswordInput = formData.get('encryptionPassword');
    const folderPath = normalizeFolderPath(typeof folderInput === 'string' ? folderInput : '/');
    const isLibrary =
      typeof isLibraryInput === 'string'
        ? isLibraryInput === 'true' || isLibraryInput === '1'
        : true;
    const isEncryptedUpload =
      typeof encryptedInput === 'string'
        ? ['true', '1', 'yes', 'on'].includes(encryptedInput.toLowerCase())
        : false;
    const encryptionPassword =
      typeof encryptionPasswordInput === 'string' ? encryptionPasswordInput : '';
    
    if (!files || files.length === 0) {
      return Response.json({ error: 'No files provided' }, { status: 400 });
    }
    if (folderPath !== '/' && !getAttachmentFolderByPath(folderPath)) {
      return Response.json({ error: 'Folder not found' }, { status: 400 });
    }
    if (isEncryptedUpload && !isLibrary) {
      return Response.json({ error: 'Encrypted uploads can only be added through the files library' }, { status: 400 });
    }
    if (isEncryptedUpload && files.length > 1) {
      return Response.json({ error: 'Upload encrypted files one at a time so each can have its own password' }, { status: 400 });
    }
    if (isEncryptedUpload && !encryptionPassword.trim()) {
      return Response.json({ error: 'A password is required for encrypted uploads' }, { status: 400 });
    }
    
    // Validate file types
    for (const file of files) {
      if (!ALLOWED_MIMETYPES.includes(file.type)) {
        return Response.json({ 
          error: `File type not supported: ${file.type}. Only images and text documents are allowed.` 
        }, { status: 400 });
      }
    }
    
    const uploadDir = resolveUploadDir();
    const uploadDirUrl = toDirectoryUrl(uploadDir);
    
    const attachments = [];
    
    for (const file of files) {
      if (isEncryptedUpload) {
        const bytes = new Uint8Array(await Bun.readableStreamToArrayBuffer(file.stream()));
        const encryptedBytes = await createEncryptedZip(bytes, file.name, encryptionPassword);
        const filename = `${nanoid()}-${Date.now()}.zip`;
        const filepath = Bun.fileURLToPath(new URL(`./${filename}`, uploadDirUrl));

        await Bun.write(filepath, encryptedBytes);

        const attachment = createAttachment(
          file.name,
          file.type,
          bytes.byteLength,
          filepath,
          undefined,
          folderPath,
          isLibrary,
          { isEncrypted: true, encryptionPasswordHash: hashPassword(encryptionPassword) }
        );

        attachments.push(attachment);
        continue;
      }

      let binaryStream = file.stream();
      let textCapturePromise: Promise<string | undefined> | undefined;
      
      if (shouldStreamTextContent(file.type)) {
        const [bytesStream, textStream] = binaryStream.tee();
        binaryStream = bytesStream;
        textCapturePromise = Bun.readableStreamToText(textStream)
          .catch(err => {
            console.error('Failed to read text attachment stream:', err);
            return undefined;
          });
      }
      
      const bytesPromise = Bun.readableStreamToArrayBuffer(binaryStream);
      const arrayBuffer = await bytesPromise;
      const bytes = new Uint8Array(arrayBuffer);
      
      const extractedText = textCapturePromise
        ? await textCapturePromise
        : await extractTextFromBytes(bytes, file.type);
      const normalizedText = extractedText?.trim();
      
      // Generate unique filename
      const ext = getExtension(file.name);
      const filename = `${nanoid()}-${Date.now()}${ext}`;
      const filepath = Bun.fileURLToPath(new URL(`./${filename}`, uploadDirUrl));
      
      // Save file
      await Bun.write(filepath, bytes);
      
      // Save to database
      const attachment = createAttachment(
        file.name,
        file.type,
        bytes.byteLength,
        filepath,
        normalizedText && normalizedText.length > 0 ? normalizedText : undefined,
        folderPath,
        isLibrary
      );
      
      attachments.push(attachment);
    }
    
    const sanitized = attachments.map((att) => {
      const { encryption_password_hash, failed_attempts, ...rest } = att as any;
      return rest;
    });
    
    return Response.json({ 
      success: true,
      attachments: sanitized,
      count: sanitized.length
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    return Response.json(
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}
