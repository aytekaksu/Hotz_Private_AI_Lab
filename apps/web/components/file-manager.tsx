'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { uploadWithProgress } from '@/lib/client/upload';

export type ManagedFile = {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  created_at: string;
  folder_path?: string | null;
  message_id?: string | null;
  is_library?: number | boolean;
  text_content?: string | null;
  is_encrypted?: number | boolean;
  encryptionPassword?: string;
};

export type ManagedFolder = {
  id: string;
  name: string;
  path: string;
  parent_path?: string | null;
};

type FileManagerProps = {
  selectedIds: string[];
  onSelect: (file: ManagedFile) => void;
  onDeselect: (fileId: string) => void;
  refreshToken?: number;
  onMutate?: () => void;
  allowEncryptedSelection?: boolean;
};

const formatBytes = (bytes: number): string => {
  if (!bytes || Number.isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || value === Math.floor(value) ? 0 : 1)} ${units[i]}`;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getParentPath = (path: string): string => {
  if (!path || path === '/') return '/';
  const segments = path.split('/').filter(Boolean);
  segments.pop();
  return segments.length ? `/${segments.join('/')}` : '/';
};

const isSameOrDescendant = (path: string, target: string) => {
  if (target === '/') return true;
  return path === target || path.startsWith(target.endsWith('/') ? target : `${target}/`);
};

export function FileManager({ selectedIds, onSelect, onDeselect, refreshToken = 0, onMutate, allowEncryptedSelection = true }: FileManagerProps) {
  const [folderPath, setFolderPath] = useState<string>('/');
  const [folders, setFolders] = useState<ManagedFolder[]>([]);
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deletingFolderRef = useRef<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const encryptedUploadInputRef = useRef<HTMLInputElement>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const loadFolder = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files?folderPath=${encodeURIComponent(path || '/')}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to load files');
      }
      setFolders(Array.isArray(data.folders) ? data.folders : []);
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (err) {
      console.error('Failed to load file manager data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFolder(folderPath);
  }, [folderPath, loadFolder, refreshToken]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    const formData = new FormData();
    Array.from(fileList).forEach((file) => {
      formData.append('files', file);
    });
    formData.append('folderPath', folderPath);
    formData.append('isLibrary', 'true');

    try {
      const data = await uploadWithProgress<{ error?: string } | { attachments?: ManagedFile[] }>(
        '/api/uploads',
        formData,
        {
          onProgress: (percent) => setUploadProgress(percent),
        },
      );
      if ((data as any)?.error) {
        throw new Error((data as any).error || 'Failed to upload files');
      }
      await loadFolder(folderPath);
      onMutate?.();
    } catch (err) {
      console.error('File upload failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload files');
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
    }
  };

  const handleEncryptedUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    if (fileList.length > 1) {
      setError('Upload encrypted files one at a time so each can have its own password.');
      setUploadProgress(null);
      if (encryptedUploadInputRef.current) encryptedUploadInputRef.current.value = '';
      return;
    }
    let password = '';
    while (true) {
      const first = prompt('Set a password for this encrypted file (required):') || '';
      if (!first.trim()) {
        if (encryptedUploadInputRef.current) encryptedUploadInputRef.current.value = '';
        return;
      }
      const second = prompt('Re-enter the password to confirm:') || '';
      if (first === second) {
        password = first;
        break;
      }
      alert('Passwords did not match. Please enter the same password twice.');
    }
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    const formData = new FormData();
    Array.from(fileList).forEach((file) => {
      formData.append('files', file);
    });
    formData.append('folderPath', folderPath);
    formData.append('isLibrary', 'true');
    formData.append('encrypted', 'true');
    formData.append('encryptionPassword', password);

    try {
      const data = await uploadWithProgress<{ error?: string } | { attachments?: ManagedFile[] }>(
        '/api/uploads',
        formData,
        {
          onProgress: (percent) => setUploadProgress(percent),
        },
      );
      if ((data as any)?.error) {
        throw new Error((data as any).error || 'Failed to upload encrypted file');
      }
      await loadFolder(folderPath);
      onMutate?.();
    } catch (err) {
      console.error('Encrypted file upload failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload encrypted file');
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (encryptedUploadInputRef.current) {
        encryptedUploadInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (file: ManagedFile) => {
    const confirmed = confirm(`Remove "${file.filename}" from your file manager? Past chats will keep their copy.`);
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/files/${file.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to delete file');
      }
      if (selectedSet.has(file.id)) {
        onDeselect(file.id);
      }
      await loadFolder(folderPath);
      onMutate?.();
    } catch (err) {
      console.error('Failed to delete file:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    }
  };

  const handleRenameFile = async (file: ManagedFile) => {
    const name = prompt('Rename file in library', file.filename);
    if (!name || !name.trim()) return;
    try {
      const res = await fetch(`/api/files/${file.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to rename file');
      }
      await loadFolder(folderPath);
      onMutate?.();
    } catch (err) {
      console.error('Failed to rename file:', err);
      setError(err instanceof Error ? err.message : 'Failed to rename file');
    }
  };

  const handleRenameFolder = async (folder: ManagedFolder) => {
    const name = prompt('Rename folder', folder.name);
    if (!name || !name.trim()) return;
    try {
      const res = await fetch('/api/files/folders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folder.path, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to rename folder');
      }
      const renamedPath = data.folder?.path || folder.path;
      if (isSameOrDescendant(folderPath, folder.path)) {
        setFolderPath((prev) => prev.replace(folder.path, renamedPath));
      } else {
        await loadFolder(folderPath);
      }
      onMutate?.();
    } catch (err) {
      console.error('Failed to rename folder:', err);
      setError(err instanceof Error ? err.message : 'Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (folder: ManagedFolder) => {
    const first = confirm(`Delete folder "${folder.name}"?`);
    if (!first) return;
    const second = confirm('This will remove this folder and all files it contains. Are you sure?');
    if (!second) return;
    deletingFolderRef.current = folder.path;
    try {
      const res = await fetch(`/api/files/folders?path=${encodeURIComponent(folder.path)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to delete folder');
      }
      const parent = getParentPath(folder.path);
      if (isSameOrDescendant(folderPath, folder.path)) {
        setFolderPath(parent || '/');
      } else {
        await loadFolder(folderPath);
      }
      onMutate?.();
    } catch (err) {
      console.error('Failed to delete folder:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete folder');
    } finally {
      deletingFolderRef.current = null;
    }
  };

  const handleOpenEncrypted = async (file: ManagedFile) => {
    setError(null);
    let lastError: string | null = null;
    while (true) {
      const password: string = prompt(
        lastError ? `${lastError}\n\nEnter the password for "${file.filename}"` : `Enter the password for "${file.filename}"`,
      ) || '';
      if (!password.trim()) return;
      try {
        const res: Response = await fetch(`/api/attachments/${file.id}/unlock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        if (!res.ok) {
          const data: any = await res.json().catch(() => ({}));
          const message: string = data?.error || 'Failed to unlock file (check the password and try again)';
          if (res.status === 410 || /deleted/i.test(message)) {
            setError(message);
            await loadFolder(folderPath);
            return;
          }
          lastError = message;
          continue;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.download = file.filename || 'file';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      } catch (err) {
        console.error('Failed to open encrypted file:', err);
        setError(err instanceof Error ? err.message : 'Failed to open encrypted file');
        return;
      }
    }
  };

  const handleNewFolder = async () => {
    const name = prompt('Folder name');
    if (!name || !name.trim()) return;
    try {
      const res = await fetch('/api/files/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), parentPath: folderPath }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to create folder');
      }
      setFolders((prev) => [data.folder, ...prev]);
    } catch (err) {
      console.error('Failed to create folder:', err);
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    }
  };

  const breadcrumbs = useMemo(() => {
    const segments = folderPath.split('/').filter(Boolean);
    const crumbs: Array<{ label: string; path: string }> = [{ label: 'Root', path: '/' }];
    let current = '';
    for (const segment of segments) {
      current += `/${segment}`;
      crumbs.push({ label: segment, path: current || '/' });
    }
    return crumbs;
  }, [folderPath]);

  return (
    <div className="w-full rounded-2xl border border-border bg-background p-3 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
          {breadcrumbs.map((crumb, idx) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {idx > 0 && <span className="text-foreground/30">/</span>}
              <button
                className={`rounded px-1 py-px transition ${crumb.path === folderPath ? 'text-foreground' : 'hover:text-foreground'}`}
                onClick={() => setFolderPath(crumb.path)}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {folderPath !== '/' && (
            <button
              type="button"
              onClick={() => setFolderPath(getParentPath(folderPath))}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] text-muted transition hover:text-foreground"
            >
              ↑ Up
            </button>
          )}
          <button
            type="button"
            onClick={handleNewFolder}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
              <path d="M10 4.167v11.666M4.167 10h11.666" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            New folder
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground">
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
              <path d="M4.167 10 10 4.167m0 0L15.833 10M10 4.167V15" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {uploading ? 'Uploading…' : 'Upload'}
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground">
            <input
              ref={encryptedUploadInputRef}
              type="file"
              multiple={false}
              className="hidden"
              onChange={(e) => handleEncryptedUpload(e.target.files)}
            />
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4">
              <path d="M6.667 9.167v-2.5a3.333 3.333 0 1 1 6.666 0v2.5m-8.333 0h10V15a1.667 1.667 0 0 1-1.667 1.667H8.333A1.667 1.667 0 0 1 6.667 15V9.167Z" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {uploading ? 'Uploading…' : 'Encrypted'}
          </label>
        </div>
      </div>
      {uploading && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <div className="relative h-1.5 w-28 overflow-hidden rounded-full bg-border/60">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${Math.max(uploadProgress ?? 10, 5)}%` }}
            />
          </div>
          <span>{uploadProgress !== null ? `Uploading… ${uploadProgress}%` : 'Uploading…'}</span>
        </div>
      )}

      {error && <div className="mt-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</div>}

      <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-border/60 bg-surface/60">
        {loading ? (
          <div className="px-3 py-4 text-center text-xs text-muted">Loading…</div>
        ) : (
          <div className="divide-y divide-border/70 text-sm text-foreground">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-background/60"
              >
                <button
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => setFolderPath(folder.path)}
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4 text-accent">
                    <path d="M3.333 15.833V4.167h5L10 6.667h6.667v9.166H3.333Z" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                  <span className="font-medium">{folder.name}</span>
                </button>
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <button
                    className="rounded-full border border-border px-2 py-0.5 transition hover:text-foreground"
                    onClick={() => handleRenameFolder(folder)}
                  >
                    Rename
                  </button>
                  <button
                    className="rounded-full border border-border px-2 py-0.5 transition hover:text-foreground"
                    onClick={() => handleDeleteFolder(folder)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {files.length === 0 && folders.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted">No files yet. Upload to get started.</div>
            ) : (
              files.map((file) => {
                const isSelected = selectedSet.has(file.id);
                return (
                  <div key={file.id} className="flex items-center gap-3 px-3 py-2 transition hover:bg-background/50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {file.is_encrypted ? (
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-3.5 w-3.5 text-accent">
                            <path d="M6.667 9.167v-2.5a3.333 3.333 0 1 1 6.666 0v2.5m-8.333 0h10V15a1.667 1.667 0 0 1-1.667 1.667H8.333A1.667 1.667 0 0 1 6.667 15V9.167Z" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-3.5 w-3.5 text-muted">
                            <path d="M4.167 5.833h6.666L12.5 7.5h3.333v6.667H4.167V5.833Z" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        <span className="truncate font-medium">{file.filename}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {formatBytes(file.size)} • {formatDate(file.created_at)}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
                        {file.is_encrypted ? (
                          <button
                            type="button"
                            onClick={() => handleOpenEncrypted(file)}
                            className="underline transition hover:text-foreground"
                          >
                            Unlock
                          </button>
                        ) : (
                          <a
                            href={`/api/attachments/${file.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline transition hover:text-foreground"
                          >
                            Open
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRenameFile(file)}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] transition hover:text-foreground"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(file)}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] transition hover:text-foreground"
                          title="Delete from file manager (past chats keep their copy)"
                        >
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-3.5 w-3.5">
                            <path d="M5.833 6.667h8.334M8.333 6.667v8.333m3.334-8.333v8.333M7.5 6.667V5a1.667 1.667 0 0 1 1.667-1.667h1.666A1.667 1.667 0 0 1 12.5 5v1.667m-7.5 0h10" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </div>
                    <label className="relative inline-flex h-5 w-9 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={isSelected}
                        onChange={async (e) => {
                          if (e.target.checked) {
                            if (file.is_encrypted && !allowEncryptedSelection) {
                              setError('Encrypted files cannot be selected here.');
                              e.target.checked = false;
                              return;
                            }
                            if (file.is_encrypted) {
                              let lastError: string | null = null;
                              while (true) {
                                const password: string = prompt(
                                  lastError
                                    ? `${lastError}\n\nEnter the password for "${file.filename}"`
                                    : `Enter the password for "${file.filename}"`,
                                ) || '';
                                if (!password.trim()) {
                                  e.target.checked = false;
                                  return;
                                }
                                try {
                                  const res: Response = await fetch(`/api/attachments/${file.id}/unlock`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ password, validateOnly: true }),
                                  });
                                  if (!res.ok) {
                                    const data: any = await res.json().catch(() => ({}));
                                    const message: string = data?.error || 'Incorrect password';
                                    if (res.status === 410 || /deleted/i.test(message)) {
                                      setError(message);
                                      e.target.checked = false;
                                      await loadFolder(folderPath);
                                      return;
                                    }
                                    lastError = message;
                                    continue;
                                  }
                                  onSelect({ ...file, encryptionPassword: password });
                                  return;
                                } catch (err) {
                                  console.error('Failed to validate password', err);
                                  setError('Failed to validate password');
                                  e.target.checked = false;
                                  return;
                                }
                              }
                            }
                            onSelect(file);
                          } else {
                            onDeselect(file.id);
                          }
                        }}
                      />
                      <span className="h-5 w-9 rounded-full bg-border transition peer-checked:bg-foreground" />
                      <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-card transition peer-checked:translate-x-4" />
                    </label>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
