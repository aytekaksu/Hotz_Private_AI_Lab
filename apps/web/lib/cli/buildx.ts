import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLogger, ensureDir, Logger } from './core';

const DEFAULT_BUILDX_VERSION = 'v0.29.1';

const resolveArch = (): 'amd64' | 'arm64' => {
  const arch = process.arch;
  if (arch === 'x64') return 'amd64';
  if (arch === 'arm64') return 'arm64';
  throw new Error(`Unsupported architecture for Buildx installation: ${arch}`);
};

const getPluginPath = (): string => {
  const home = Bun.env.HOME || os.homedir();
  return path.join(home, '.docker', 'cli-plugins', 'docker-buildx');
};

const exec = async (
  args: string[],
  { quiet = false, allowFailure = false }: { quiet?: boolean; allowFailure?: boolean } = {}
): Promise<number> => {
  const proc = Bun.spawn({
    cmd: args,
    stdin: 'inherit',
    stdout: quiet ? 'ignore' : 'inherit',
    stderr: quiet ? 'ignore' : 'inherit',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0 && !allowFailure) {
    throw new Error(`Command failed (${args.join(' ')}), exit code ${exitCode}`);
  }
  return exitCode;
};

const isBuildxAvailable = async (): Promise<boolean> =>
  (await exec(['docker', 'buildx', 'version'], { quiet: true, allowFailure: true })) === 0;

export const ensureBuildxPlugin = async (logger: Logger = createLogger('buildx')): Promise<void> => {
  if (await isBuildxAvailable()) {
    logger.info('Docker Buildx already available.');
    return;
  }

  const version = Bun.env.BUILDX_VERSION || DEFAULT_BUILDX_VERSION;
  const arch = resolveArch();
  const pluginPath = getPluginPath();
  const pluginDir = path.dirname(pluginPath);
  await ensureDir(pluginDir);

  const downloadUrl = `https://github.com/docker/buildx/releases/download/${version}/buildx-${version}.linux-${arch}`;
  logger.info(`Installing Docker Buildx ${version} (${arch})…`);
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Docker Buildx (${response.status}): ${downloadUrl}`);
  }

  const tmpPath = `${pluginPath}.${Date.now()}.tmp`;
  const buffer = await response.arrayBuffer();
  await Bun.write(tmpPath, new Uint8Array(buffer));
  await fs.chmod(tmpPath, 0o755);
  await fs.rename(tmpPath, pluginPath);
  logger.info(`Buildx installed at ${pluginPath}`);
};

export const ensureBuildxBuilder = async (
  builderName: string,
  logger: Logger = createLogger('buildx')
): Promise<void> => {
  await ensureBuildxPlugin(logger);
  const inspectExit = await exec(['docker', 'buildx', 'inspect', builderName], { quiet: true, allowFailure: true });

  if (inspectExit === 0) {
    await exec(['docker', 'buildx', 'use', builderName], { quiet: true });
    return;
  }

  logger.info(`Creating Docker Buildx builder (${builderName})…`);
  await exec(['docker', 'buildx', 'create', '--name', builderName, '--driver', 'docker-container', '--use']);
};
