import { NextRequest } from 'next/server';
import { deleteAttachment, renameLibraryAttachment } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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
