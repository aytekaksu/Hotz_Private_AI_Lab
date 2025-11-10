import { NextRequest } from 'next/server';
import { getAttachmentById } from '@/lib/db';

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
    
    const file = Bun.file(attachment.path);
    if (!(await file.exists())) {
      return new Response('Attachment contents missing', { status: 404 });
    }

    return new Response(file.stream(), {
      headers: {
        'Content-Type': attachment.mimetype,
        'Content-Disposition': `inline; filename="${attachment.filename}"`,
        'Content-Length': String(file.size ?? attachment.size),
      },
    });
  } catch (error) {
    console.error('Error serving attachment:', error);
    return new Response('Failed to serve attachment', { status: 500 });
  }
}
