import { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { createAttachment } from '@/lib/db';
import path from 'path';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';

// Helper to extract text from common file types
async function extractText(buffer: Buffer, mimetype: string): Promise<string | undefined> {
  try {
    if (mimetype.startsWith('text/')) {
      return buffer.toString('utf-8');
    }
    // For other file types, return undefined (could add PDF/DOCX parsers later)
    return undefined;
  } catch (error) {
    console.error('Error extracting text:', error);
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return Response.json({ error: 'No files provided' }, { status: 400 });
    }
    
    const uploadDir = process.env.DATABASE_URL?.includes('/data/')
      ? '/root/Hotz_AI_Lab/data/sqlite/uploads'
      : path.join(process.cwd(), 'data', 'uploads');
    
    // Ensure upload directory exists
    await mkdir(uploadDir, { recursive: true });
    
    const attachments = [];
    
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Generate unique filename
      const ext = path.extname(file.name);
      const filename = `${nanoid()}-${Date.now()}${ext}`;
      const filepath = path.join(uploadDir, filename);
      
      // Save file
      await writeFile(filepath, buffer);
      
      // Extract text content if possible
      const textContent = await extractText(buffer, file.type);
      
      // Save to database
      const attachment = createAttachment(
        file.name,
        file.type,
        buffer.length,
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
