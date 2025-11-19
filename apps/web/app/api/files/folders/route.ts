import { NextRequest } from 'next/server';
import { createAttachmentFolder, deleteAttachmentFolder, normalizeFolderPath, renameAttachmentFolder } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, parentPath } = body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return Response.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const folder = createAttachmentFolder(name, parentPath || '/');
    return Response.json({ folder });
  } catch (error) {
    console.error('Failed to create folder:', error);
    const message = error instanceof Error ? error.message : 'Failed to create folder';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const body = req.method === 'DELETE' ? await req.text() : null;
    let path = searchParams.get('path') || '';
    if (!path && body) {
      try {
        const parsed = JSON.parse(body);
        path = parsed?.path || '';
      } catch {}
    }
    const normalized = normalizeFolderPath(path || '/');
    if (normalized === '/') {
      return Response.json({ error: 'Cannot delete root folder' }, { status: 400 });
    }
    deleteAttachmentFolder(normalized);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Failed to delete folder:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete folder';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { path, name } = body || {};
    if (!path || typeof name !== 'string' || !name.trim()) {
      return Response.json({ error: 'Path and name are required' }, { status: 400 });
    }
    const renamed = renameAttachmentFolder(path, name);
    if (!renamed) {
      return Response.json({ error: 'Folder not found' }, { status: 404 });
    }
    return Response.json({ folder: renamed });
  } catch (error) {
    console.error('Failed to rename folder:', error);
    const message = error instanceof Error ? error.message : 'Failed to rename folder';
    return Response.json({ error: message }, { status: 500 });
  }
}
