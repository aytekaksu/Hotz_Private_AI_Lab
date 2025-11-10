import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Level = 'log' | 'warn' | 'error';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(baseDir, '../../../..');
export const resolveFromRoot = (...segments: string[]): string => path.resolve(repoRoot, ...segments);

const printer =
  (scope: string, level: Level) =>
  (...args: unknown[]) =>
    console[level](`[${scope}]`, ...args);

export const createLogger = (scope: string) => {
  const info = printer(scope, 'log');
  return {
    scope,
    info,
    warn: printer(scope, 'warn'),
    error: printer(scope, 'error'),
    success: info,
  };
};
export type Logger = ReturnType<typeof createLogger>;

export const pathExists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

export const ensureDir = async (dir: string): Promise<void> => {
  await fs.mkdir(dir, { recursive: true });
};

export const removePath = async (target: string): Promise<void> => {
  await fs.rm(target, { recursive: true, force: true });
};
