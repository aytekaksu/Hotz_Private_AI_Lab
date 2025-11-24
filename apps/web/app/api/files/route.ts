import { NextRequest } from 'next/server';
import { getAttachmentFolders, getAttachmentsInFolder, normalizeFolderPath } from '@/lib/db';
import { sanitizeAttachments } from '@/lib/files/sanitize-attachment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const folderPath = normalizeFolderPath(req.nextUrl.searchParams.get('folderPath') || '/');
    const folders = getAttachmentFolders(folderPath);
    const files = sanitizeAttachments(getAttachmentsInFolder(folderPath, true));

    return Response.json({
      folderPath,
      folders,
      files,
    });
  } catch (error) {
    console.error('Failed to list files:', error);
    return Response.json({ error: 'Failed to load files' }, { status: 500 });
  }
}
