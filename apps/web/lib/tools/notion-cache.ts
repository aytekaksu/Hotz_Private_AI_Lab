import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

export type CachedNotionPage = {
  cacheKey: string;
  pageId: string;
  lines: string[];
  lineCount: number;
  filePath: string;
  properties: any;
  url?: string | null;
  created_time?: string;
  last_edited_time?: string;
};

export class NotionPageCache {
  private readonly sessionDir: string;
  private readonly pageIndex = new Map<string, string>(); // pageId -> cacheKey
  private readonly cache = new Map<string, CachedNotionPage>();

  constructor(baseDir = path.join(process.env.TMPDIR || os.tmpdir(), 'notion-cache')) {
    this.sessionDir = path.join(baseDir, randomUUID());
  }

  get sessionId(): string {
    return path.basename(this.sessionDir);
  }

  private async ensureDir() {
    await fs.mkdir(this.sessionDir, { recursive: true });
  }

  private sanitizeFilename(input: string): string {
    return input.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  async store(
    pageId: string,
    lines: string[],
    meta: {
      properties: any;
      url?: string | null;
      created_time?: string;
      last_edited_time?: string;
    },
  ): Promise<CachedNotionPage> {
    await this.ensureDir();
    const safeName = this.sanitizeFilename(pageId);
    const filePath = path.join(this.sessionDir, `${safeName}.txt`);
    await fs.writeFile(filePath, lines.join('\n'), 'utf8');

    const cacheKey = `${this.sessionId}:${safeName}:${randomUUID()}`;
    const entry: CachedNotionPage = {
      cacheKey,
      pageId,
      lines,
      lineCount: lines.length,
      filePath,
      properties: meta.properties,
      url: meta.url ?? null,
      created_time: meta.created_time,
      last_edited_time: meta.last_edited_time,
    };

    this.cache.set(cacheKey, entry);
    this.pageIndex.set(pageId, cacheKey);
    return entry;
  }

  private async hydrateLines(cacheKey: string): Promise<CachedNotionPage | null> {
    const existing = this.cache.get(cacheKey);
    if (!existing) return null;
    if (Array.isArray(existing.lines) && existing.lines.length > 0) {
      return existing;
    }
    try {
      const raw = await fs.readFile(existing.filePath, 'utf8');
      const lines = raw.split('\n');
      const updated: CachedNotionPage = { ...existing, lines, lineCount: lines.length };
      this.cache.set(cacheKey, updated);
      return updated;
    } catch (error) {
      console.error('Failed to hydrate cached Notion page lines:', error);
      return existing;
    }
  }

  getByKey(cacheKey: string | null | undefined): CachedNotionPage | null {
    if (!cacheKey) return null;
    return this.cache.get(cacheKey) ?? null;
  }

  getByPageId(pageId: string): CachedNotionPage | null {
    const cacheKey = this.pageIndex.get(pageId);
    if (!cacheKey) return null;
    return this.cache.get(cacheKey) ?? null;
  }

  async slice(cacheKey: string, start: number, end?: number): Promise<{
    start: number;
    end: number;
    lines: string[];
    lineCount: number;
  } | null> {
    const hydrated = await this.hydrateLines(cacheKey);
    if (!hydrated) return null;

    const total = hydrated.lineCount || 0;
    if (total === 0) {
      return { start: 0, end: 0, lines: [], lineCount: 0 };
    }

    const safeStart = Math.max(1, Math.min(start, total));
    const safeEnd = Math.max(safeStart, Math.min(end ?? total, total));
    const slice = hydrated.lines.slice(safeStart - 1, safeEnd);

    return {
      start: safeStart,
      end: safeEnd,
      lines: slice,
      lineCount: total,
    };
  }

  async ensureLines(cacheKey: string): Promise<CachedNotionPage | null> {
    return this.hydrateLines(cacheKey);
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.sessionDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean Notion cache directory:', error);
    }
    this.cache.clear();
    this.pageIndex.clear();
  }
}

export const createNotionPageCache = (baseDir?: string) => new NotionPageCache(baseDir);
