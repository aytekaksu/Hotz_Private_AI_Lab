import { NextRequest } from 'next/server';
import { getAttachmentById } from '@/lib/db';
import { AttachmentAccessError, readAttachmentBytes } from '@/lib/files/attachment-access';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const attachment = getAttachmentById(params.id);
    if (!attachment) {
      return Response.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === 'string' ? body.password : '';
    const validateOnly = body?.validateOnly === true;

    if (attachment.is_encrypted && !password) {
      return Response.json({ error: 'Password required' }, { status: 400 });
    }

    if (!attachment.is_encrypted) {
      const file = Bun.file(attachment.path);
      if (!(await file.exists())) {
        return new Response('Attachment contents missing', { status: 404 });
      }
      if (validateOnly) {
        return Response.json({ success: true });
      }
      return new Response(file.stream(), {
        headers: {
          'Content-Type': attachment.mimetype,
          'Content-Disposition': `inline; filename="${attachment.filename}"`,
          'Content-Length': String(file.size ?? attachment.size),
        },
      });
    }

    const bytes = await readAttachmentBytes(attachment, password);
    if (validateOnly) {
      return Response.json({ success: true });
    }
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': attachment.mimetype,
        'Content-Disposition': `inline; filename="${attachment.filename}"`,
        'Content-Length': String(bytes.byteLength || attachment.size),
      },
    });
  } catch (error) {
    if (error instanceof AttachmentAccessError) {
      if (error.code === 'invalid-password') {
        const status = /deleted/i.test(error.message) ? 410 : 401;
        return Response.json({ error: error.message }, { status });
      }
      if (error.code === 'password-required') {
        return Response.json({ error: 'Password required' }, { status: 400 });
      }
      if (error.code === 'missing-file') {
        return Response.json({ error: 'Attachment contents missing' }, { status: 404 });
      }
    }
    console.error('Failed to unlock attachment:', error);
    return Response.json({ error: 'Failed to open attachment' }, { status: 500 });
  }
}
