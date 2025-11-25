import { getAttachmentFolders, getAttachmentsInFolder, normalizeFolderPath } from '@/lib/db';
import { sanitizeAttachments } from '@/lib/files/sanitize-attachment';
import { protectedRoute } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = protectedRoute(async (req) => {
  const folderPath = normalizeFolderPath(req.nextUrl.searchParams.get('folderPath') || '/');
  const folders = getAttachmentFolders(folderPath);
  const files = sanitizeAttachments(getAttachmentsInFolder(folderPath, true));

  return {
    folderPath,
    folders,
    files,
  };
});
