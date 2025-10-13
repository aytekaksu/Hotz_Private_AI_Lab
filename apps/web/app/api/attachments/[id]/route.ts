import { NextRequest } from 'next/server';
import { getAttachmentById } from '@/lib/db';
import { readFile } from 'fs/promises';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const attachmentId = params.id;
    
    const attachment = getAttachmentById(attachmentId);
    if (!attachment) {
      return new Response('Attachment not found', { status: 404 });
    }
    
    // Read the file
    const fileBuffer = await readFile(attachment.path);
    
    // Return the file with appropriate headers
    return new Response(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': attachment.mimetype,
        'Content-Disposition': `inline; filename="${attachment.filename}"`,
        'Content-Length': attachment.size.toString(),
      },
    });
  } catch (error) {
    console.error('Error serving attachment:', error);
    return new Response('Failed to serve attachment', { status: 500 });
  }
}

