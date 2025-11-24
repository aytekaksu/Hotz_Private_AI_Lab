import { NextRequest } from 'next/server';
import { createAttachment, getAttachmentFolderByPath, normalizeFolderPath } from '@/lib/db';
import { sanitizeAttachments } from '@/lib/files/sanitize-attachment';
import { countTokens, formatTokenLimitError, MAX_ATTACHMENT_TOKENS } from '@/lib/files/tokenizer';
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
  return lastDot > 0 ? normalized.slice(lastDot).toLowerCase() : '';
};

const normalizeMimeType = (value?: string | null) => {
  if (typeof value !== 'string') return '';
  const base = value.split(';')[0]?.trim().toLowerCase();
  return base || '';
};

const isImageMime = (mime: string) => mime.startsWith('image/');

const TEXT_LIKE_APPLICATION_MIMETYPES = new Set([
  'application/json',
  'application/ndjson',
  'application/x-ndjson',
  'application/jsonl',
  'application/graphql',
  'application/sql',
  'application/x-sql',
  'application/xml',
  'application/xhtml+xml',
  'application/yaml',
  'application/x-yaml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/x-typescript',
  'application/rtf',
]);

const TEXT_LIKE_EXTENSIONS = new Set([
  '.txt',
  '.log',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.ndjson',
  '.html',
  '.htm',
  '.xml',
  '.yaml',
  '.yml',
  '.ini',
  '.conf',
  '.cfg',
  '.env',
  '.properties',
  '.toml',
  '.sql',
  '.graphql',
  '.gql',
  '.srt',
  '.vtt',
  '.lrc',
  '.tex',
  '.rst',
  '.org',
  '.rtf',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.php',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ps1',
]);

const EXTENSION_MIMETYPE_MAP = new Map<string, string>([
  ['.md', 'text/markdown'],
  ['.markdown', 'text/markdown'],
  ['.csv', 'text/csv'],
  ['.tsv', 'text/tab-separated-values'],
  ['.json', 'application/json'],
  ['.jsonl', 'application/json'],
  ['.ndjson', 'application/x-ndjson'],
  ['.html', 'text/html'],
  ['.htm', 'text/html'],
  ['.xml', 'application/xml'],
  ['.yaml', 'application/yaml'],
  ['.yml', 'application/yaml'],
  ['.graphql', 'application/graphql'],
  ['.gql', 'application/graphql'],
  ['.sql', 'application/sql'],
  ['.txt', 'text/plain'],
  ['.log', 'text/plain'],
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.rtf', 'application/rtf'],
]);

const isTextLikeMime = (mime?: string) => {
  if (!mime) return false;
  return (
    mime.startsWith('text/') ||
    mime.endsWith('+json') ||
    mime.endsWith('+xml') ||
    TEXT_LIKE_APPLICATION_MIMETYPES.has(mime)
  );
};

const classifyUpload = (file: File) => {
  const normalizedType = normalizeMimeType(file.type);
  const extension = getExtension(file.name);
  const extensionMime = EXTENSION_MIMETYPE_MAP.get(extension) || '';
  const textLike =
    isTextLikeMime(normalizedType) || isTextLikeMime(extensionMime) || TEXT_LIKE_EXTENSIONS.has(extension);
  const resolvedType =
    (normalizedType && normalizedType !== 'application/octet-stream' ? normalizedType : '') ||
    extensionMime ||
    (textLike ? 'text/plain' : 'application/octet-stream');

  const allowed =
    isImageMime(normalizedType) ||
    isImageMime(extensionMime) ||
    textLike ||
    resolvedType === 'application/pdf' ||
    resolvedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  return { allowed, resolvedType };
};

const enforceTokenLimit = (text: string | null | undefined, file: File) => {
  if (!text) return;
  const tokens = countTokens(text);
  if (tokens > MAX_ATTACHMENT_TOKENS) {
    throw new Error(formatTokenLimitError(file.name, tokens, MAX_ATTACHMENT_TOKENS));
  }
};

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
    
    const uploads = files.map((file) => ({ file, ...classifyUpload(file) }));

    // Validate file types
    for (const { file, allowed, resolvedType } of uploads) {
      if (!allowed) {
        const reportedType = normalizeMimeType(file.type) || resolvedType || file.type || 'unknown';
        return Response.json({
          error: `File type not supported: ${reportedType}. Only images, PDFs/DOCX, and text-based documents (txt, csv, json, md, etc.) are allowed.`,
        }, { status: 400 });
      }
    }
    
    const uploadDir = resolveUploadDir();
    const uploadDirUrl = toDirectoryUrl(uploadDir);
    
    const attachments = [];
    
    for (const { file, resolvedType } of uploads) {
      if (isEncryptedUpload) {
        const bytes = new Uint8Array(await Bun.readableStreamToArrayBuffer(file.stream()));

        // Token guard for encrypted uploads using extracted text (same content that would feed the LLM)
        try {
          const extractedText = shouldStreamTextContent(resolvedType)
            ? new TextDecoder().decode(bytes)
            : await extractTextFromBytes(bytes, resolvedType);
          enforceTokenLimit(extractedText?.trim(), file);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'File is too large to upload';
          return Response.json({ error: message }, { status: 400 });
        }

        const encryptedBytes = await createEncryptedZip(bytes, file.name, encryptionPassword);
        const filename = `${nanoid()}-${Date.now()}.zip`;
        const filepath = Bun.fileURLToPath(new URL(`./${filename}`, uploadDirUrl));

        await Bun.write(filepath, encryptedBytes);

        const attachment = createAttachment(
          file.name,
          resolvedType,
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
      
      if (shouldStreamTextContent(resolvedType)) {
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
        : await extractTextFromBytes(bytes, resolvedType);
      const normalizedText = extractedText?.trim();

      // Token guard based on the extracted text that will be used by the model
      try {
        enforceTokenLimit(normalizedText, file);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'File is too large to upload';
        return Response.json({ error: message }, { status: 400 });
      }
      
      // Generate unique filename
      const ext = getExtension(file.name);
      const filename = `${nanoid()}-${Date.now()}${ext}`;
      const filepath = Bun.fileURLToPath(new URL(`./${filename}`, uploadDirUrl));
      
      // Save file
      await Bun.write(filepath, bytes);
      
      // Save to database
      const attachment = createAttachment(
        file.name,
        resolvedType,
        bytes.byteLength,
        filepath,
        normalizedText && normalizedText.length > 0 ? normalizedText : undefined,
        folderPath,
        isLibrary
      );
      
      attachments.push(attachment);
    }
    
    const sanitized = sanitizeAttachments(attachments);
    
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
