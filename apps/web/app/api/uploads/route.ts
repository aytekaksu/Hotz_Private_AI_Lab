import { NextRequest } from 'next/server';
import { createAttachment, getAttachmentFolderByPath, normalizeFolderPath } from '@/lib/db';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';

const TEXT_STREAM_MIMETYPES = new Set(['application/json']);

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

const shouldStreamTextContent = (mimetype: string) =>
  mimetype.startsWith('text/') || TEXT_STREAM_MIMETYPES.has(mimetype);

// Helper to extract text from binary formats that require parsing
async function extractText(data: Uint8Array, mimetype: string): Promise<string | undefined> {
  try {
    if (mimetype === 'application/pdf') {
      try {
        const pdfParse = (await import('pdf-parse')).default as (data: Buffer) => Promise<{ text: string }>;
        const res = await pdfParse(Buffer.from(data));
        return res.text || undefined;
      } catch (e) {
        console.error('PDF parse failed:', e);
        return undefined;
      }
    }
    if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const mammoth = await import('mammoth');
        const res = await mammoth.extractRawText({ buffer: Buffer.from(data) });
        const text = typeof res?.value === 'string' ? res.value : undefined;
        return text;
      } catch (e) {
        console.error('DOCX parse failed:', e);
        return undefined;
      }
    }
    // For other file types, return undefined (could add PDF/DOCX parsers later)
    return undefined;
  } catch (error) {
    console.error('Error extracting text:', error);
    return undefined;
  }
}

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
    const folderPath = normalizeFolderPath(typeof folderInput === 'string' ? folderInput : '/');
    const isLibrary =
      typeof isLibraryInput === 'string'
        ? isLibraryInput === 'true' || isLibraryInput === '1'
        : true;
    
    if (!files || files.length === 0) {
      return Response.json({ error: 'No files provided' }, { status: 400 });
    }
    if (folderPath !== '/' && !getAttachmentFolderByPath(folderPath)) {
      return Response.json({ error: 'Folder not found' }, { status: 400 });
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
        : await extractText(bytes, file.type);
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
    
    return Response.json({ 
      success: true,
      attachments,
      count: attachments.length
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    return Response.json(
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}
