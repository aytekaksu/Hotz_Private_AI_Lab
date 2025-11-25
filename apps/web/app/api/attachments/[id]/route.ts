import { NextRequest } from 'next/server';
import { getAttachmentById } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const attachmentId = params.id;
    
    const attachment = getAttachmentById(attachmentId);
    if (!attachment) {
      return new Response('Attachment not found', { status: 404 });
    }
    if (attachment.is_encrypted) {
      return Response.json({ error: 'Encrypted attachment requires a password' }, { status: 403 });
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
