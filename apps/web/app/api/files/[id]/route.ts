import { NextRequest } from 'next/server';
import { deleteAttachment, renameLibraryAttachment, getAttachmentById } from '@/lib/db';
import { sanitizeAttachment } from '@/lib/files/sanitize-attachment';
import { getSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const parseIncludeText = (value?: string | null) => {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const attachment = getAttachmentById(params.id);
    if (!attachment) {
      return Response.json({ error: 'File not found' }, { status: 404 });
    }
    const includeText = parseIncludeText(req.nextUrl.searchParams.get('includeText'));
    const sanitized = sanitizeAttachment(attachment, { includeTextContent: includeText });
    return Response.json({ attachment: sanitized });
  } catch (error) {
    console.error('Failed to fetch file:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch file';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const deleted = deleteAttachment(params.id);
    if (!deleted) {
      return Response.json({ error: 'File not found' }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (error) {
    console.error('Failed to delete file:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete file';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const body = await req.json();
    const { name } = body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }
    const renamed = renameLibraryAttachment(params.id, name);
    if (!renamed) {
      return Response.json({ error: 'File not found' }, { status: 404 });
    }
    return Response.json({ attachment: renamed });
  } catch (error) {
    console.error('Failed to rename file:', error);
    const message = error instanceof Error ? error.message : 'Failed to rename file';
    return Response.json({ error: message }, { status: 500 });
  }
}
