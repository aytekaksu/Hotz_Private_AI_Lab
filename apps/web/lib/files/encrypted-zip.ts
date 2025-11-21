import type { Entry, FileEntry } from '@zip.js/zip.js';
import { ZipReader, ZipWriter, Uint8ArrayReader, Uint8ArrayWriter, configure } from '@zip.js/zip.js';

const ZIP_STRENGTH_AES_256 = 3;

// Bun/node don't need web workers and they can hang; disable globally
configure({ useWebWorkers: false, useCompressionStream: false });

export async function createEncryptedZip(bytes: Uint8Array, filename: string, password: string): Promise<Uint8Array> {
  const writer = new Uint8ArrayWriter();
  const zipWriter = new ZipWriter(writer, {
    password,
    encryptionStrength: ZIP_STRENGTH_AES_256,
    level: 0, // no compression
  });

  await zipWriter.add(filename || 'file', new Uint8ArrayReader(bytes), {
    password,
    encryptionStrength: ZIP_STRENGTH_AES_256,
    level: 0, // store only, per requirements
  });
  await zipWriter.close();

  return writer.getData();
}

export async function unzipEncryptedZip(zipBytes: Uint8Array, password: string): Promise<{ filename: string; data: Uint8Array }> {
  const reader = new ZipReader(new Uint8ArrayReader(zipBytes), { password, useWebWorkers: false });
  const entries = await reader.getEntries();
  const entry = entries.find((e): e is FileEntry => e.directory === false);
  if (!entry) {
    await reader.close();
    throw new Error('Archive is empty');
  }
  const writer = new Uint8ArrayWriter();
  try {
    const data = await entry.getData(writer, { password, useWebWorkers: false });
    await reader.close();
    return { filename: entry.filename, data };
  } catch (error) {
    await reader.close();
    throw error;
  }
}
