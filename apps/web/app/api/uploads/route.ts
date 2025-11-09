import { NextRequest } from 'next/server';
import { mkdir } from 'fs/promises';
import { createAttachment } from '@/lib/db';
import path from 'path';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';

// Helper to extract text from common file types
async function extractText(data: Uint8Array, mimetype: string): Promise<string | undefined> {
  try {
    if (mimetype.startsWith('text/')) {
      return new TextDecoder('utf-8').decode(data);
    }
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
    
    if (!files || files.length === 0) {
      return Response.json({ error: 'No files provided' }, { status: 400 });
    }
    
    // Validate file types
    for (const file of files) {
      if (!ALLOWED_MIMETYPES.includes(file.type)) {
        return Response.json({ 
          error: `File type not supported: ${file.type}. Only images and text documents are allowed.` 
        }, { status: 400 });
      }
    }
    
    const uploadDir = process.env.DATABASE_URL?.includes('/data/')
      ? '/data/uploads'
      : path.join(process.cwd(), 'data', 'uploads');
    
    // Ensure upload directory exists
    await mkdir(uploadDir, { recursive: true });
    
    const attachments = [];
    
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      
      // Generate unique filename
      const ext = path.extname(file.name);
      const filename = `${nanoid()}-${Date.now()}${ext}`;
      const filepath = path.join(uploadDir, filename);
      
      // Save file
      await Bun.write(filepath, bytes);
      
      // Extract text content if possible
      const textContent = await extractText(bytes, file.type);
      
      // Save to database
      const attachment = createAttachment(
        file.name,
        file.type,
        bytes.byteLength,
        filepath,
        textContent
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
