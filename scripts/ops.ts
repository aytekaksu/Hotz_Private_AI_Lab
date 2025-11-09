import fs from 'node:fs/promises';
import path from 'node:path';
import { createLogger, ensureDir, pathExists, removePath, repoRoot, resolveFromRoot, Logger } from '../apps/web/lib/cli';
import { ensureBuildxBuilder, ensureBuildxPlugin } from '../apps/web/lib/cli/buildx';

type RunOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  allowFailure?: boolean;
};

const run = async (cmd: string[], options: RunOptions = {}): Promise<number> => {
  const proc = Bun.spawn({
    cmd,
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(`Command failed (${cmd.join(' ')}), exit code ${exitCode}`);
  }
  return exitCode;
};

const compose = (args: string[], options?: RunOptions) => run(['docker', 'compose', ...args], options);

const formatDuration = (ms: number) => (ms / 1000).toFixed(2);

const createStepTimer = (logger: Logger) => {
  const steps: { label: string; ms: number }[] = [];
  const started = Date.now();

  const runStep = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    logger.info(`${label}…`);
    const begin = Date.now();
    try {
      return await fn();
    } finally {
      steps.push({ label, ms: Date.now() - begin });
    }
  };

  const summary = () => {
    if (steps.length === 0) return;
    const total = Date.now() - started;
    let slowest = steps[0];
    logger.info('Timing summary:');
    for (const step of steps) {
      logger.info(`  - ${step.label}: ${formatDuration(step.ms)}s`);
      if (step.ms > slowest.ms) slowest = step;
    }
    logger.info(`Slowest step: ${slowest.label} at ${formatDuration(slowest.ms)}s`);
    logger.info(`Total time: ${formatDuration(total)}s`);
  };

  return { runStep, summary };
};

const DEPLOY_HELP = `Usage: bun run deploy [--clean|--no-cache]

Options:
  --clean, --no-cache   Force a clean Docker build without caching
  -h, --help            Show this help text
`;

const parseDeployArgs = (args: string[]) => {
  let clean = false;
  for (const arg of args) {
    if (arg === '--clean' || arg === '--no-cache') {
      clean = true;
    } else if (arg === '-h' || arg === '--help') {
      return { clean, help: true };
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return { clean, help: false };
};

const healthCheck = async (logger: Logger) => {
  const url = Bun.env.HEALTHCHECK_URL || 'https://assistant.aytekaksu.com/api/health';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      logger.warn(`Health check endpoint returned ${response.status}`);
      return;
    }
    logger.info(`Health check succeeded (${response.status}).`);
  } catch (error) {
    logger.warn(`Health check failed: ${(error as Error).message}`);
  }
};

export async function deployCli(args: string[]): Promise<void> {
  const { clean, help } = parseDeployArgs(args);
  if (help) {
    console.log(DEPLOY_HELP);
    return;
  }

  const logger = createLogger('deploy');
  const timer = createStepTimer(logger);
  const builderName = Bun.env.BUILDX_BUILDER_NAME || 'hotz_lab_builder';
  const cacheDir = resolveFromRoot('.docker/cache');
  const cacheTmp = resolveFromRoot('.docker/cache-tmp');

  try {
    await timer.runStep('Ensuring workspace dependencies', () => run(['bun', 'install']));

    await timer.runStep('Building web image', async () => {
      await ensureBuildxBuilder(builderName, logger);
      const cmd = [
        'docker',
        'buildx',
        'build',
        '--builder',
        builderName,
        '--progress=plain',
        '--load',
        '--tag',
        'hotz_private_ai_lab-web',
        '--file',
        'apps/web/Dockerfile',
        '--build-arg',
        'APP_SRC=apps/web',
        '.',
      ];

      if (clean) {
        cmd.push('--no-cache');
      } else {
        if (await pathExists(cacheDir)) {
          cmd.push('--cache-from', `type=local,src=${cacheDir}`);
        }
        await removePath(cacheTmp);
        await ensureDir(cacheTmp);
        cmd.push('--cache-to', `type=local,dest=${cacheTmp},mode=max`);
      }

      try {
        await run(cmd);
        if (!clean) {
          await removePath(cacheDir);
          await fs.rename(cacheTmp, cacheDir);
        }
      } finally {
        await removePath(cacheTmp);
      }
    });

    await timer.runStep('Recreating web service', () => compose(['up', '-d', 'web']));

    await timer.runStep('Running DB migrations', async () => {
      const exit = await run(['bun', 'run', 'db:migrate'], {
        env: { DATABASE_URL: `file://${path.join(repoRoot, 'data/sqlite/app.db')}` },
        allowFailure: true,
      });
      if (exit !== 0) {
        logger.warn('Database migrations reported a non-zero exit code; continuing.');
      }
    });

    await timer.runStep('Services status', () => compose(['ps']));
    await timer.runStep('Health check', () => healthCheck(logger));
    logger.success('Deploy completed successfully.');
  } catch (error) {
    logger.error('Deploy failed:', (error as Error).message);
    process.exitCode = 1;
  } finally {
    timer.summary();
  }
}

const timestamp = (date = new Date()) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '_');

const pruneOldBackups = async (dir: string, retentionDays: number, logger: Logger) => {
  try {
    const entries = await fs.readdir(dir);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    await Promise.all(
      entries
        .filter((file) => /^backup_\d{8}_\d{6}\.tar\.gz$/.test(file))
        .map(async (file) => {
          const fullPath = path.join(dir, file);
          const stats = await fs.stat(fullPath);
          if (stats.isFile() && stats.mtimeMs < cutoff) {
            await fs.rm(fullPath);
            logger.info(`Removed expired backup ${file}`);
          }
        })
    );
  } catch (error) {
    logger.warn(`Failed to prune old backups: ${(error as Error).message}`);
  }
};

export async function backupCli(): Promise<void> {
  const logger = createLogger('backup');
  const backupDir = Bun.env.BACKUP_DIR || '/opt/backups/ai-assistant';
  const retentionDays = Number(Bun.env.BACKUP_RETENTION_DAYS ?? 7);
  const filePath = path.join(backupDir, `backup_${timestamp()}.tar.gz`);
  let restarted = false;

  try {
    await ensureDir(backupDir);
    logger.info('Stopping services…');
    await compose(['stop']);

    logger.info(`Creating backup ${filePath}…`);
    await run(['tar', '-czf', filePath, '--ignore-failed-read', 'data/sqlite', '.env']);

    logger.info('Restarting services…');
    await compose(['start']);
    restarted = true;

    await pruneOldBackups(backupDir, retentionDays, logger);
    logger.success(`Backup completed: ${filePath}`);
  } catch (error) {
    logger.error(`Backup failed: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    if (!restarted) {
      await compose(['start'], { allowFailure: true });
    }
  }
}

export async function restoreCli(args: string[]): Promise<void> {
  const logger = createLogger('restore');
  const target = args[0];
  if (!target || target === '--help' || target === '-h') {
    console.log('Usage: bun run restore <backup-file.tar.gz>');
    process.exit(target ? 0 : 1);
  }

  const backupPath = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  if (!(await pathExists(backupPath))) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  logger.info(`Restoring from ${backupPath}…`);
  await compose(['down']);
  await run(['tar', '-xzf', backupPath, '-C', '/']);
  await compose(['up', '-d']);
  logger.success('Restore completed. Please verify the application manually.');
}

const renderHeaders = () => `    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
    }`;

const buildCaddyfile = (domain: string, email: string, token: string) => {
  const base = `{
    email ${email}
}

${domain} {
    reverse_proxy web:3000

`;
  if (token) {
    return (
      base +
      `    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }

${renderHeaders()}
}
`
    );
  }
  return `${base}${renderHeaders()}
}
`;
};

export async function provisionTlsCli(): Promise<void> {
  const logger = createLogger('tls');
  const domain = (Bun.env.INTERNAL_DOMAIN || '').trim();
  const email = (Bun.env.ACME_EMAIL || '').trim();
  const token = (Bun.env.CLOUDFLARE_API_TOKEN || '').trim();

  if (!domain || !email) {
    throw new Error('INTERNAL_DOMAIN and ACME_EMAIL must be set (see .env).');
  }

  const caddyfile = path.join(repoRoot, 'Caddyfile');
  if (!(await pathExists(caddyfile))) {
    throw new Error(`Caddyfile not found at ${caddyfile}`);
  }

  const backup = `${caddyfile}.${timestamp()}.bak`;
  logger.info(`Backing up Caddyfile to ${backup}`);
  await Bun.write(backup, Bun.file(caddyfile));

  logger.info(`Writing TLS configuration for ${domain} (${token ? 'DNS-01' : 'HTTP/ALPN'})`);
  await Bun.write(caddyfile, buildCaddyfile(domain, email, token));

  logger.info('Restarting caddy…');
  await compose(['up', '-d', 'caddy']);
  logger.success('Provisioning complete.');
}

export async function setupBuildxCli(): Promise<void> {
  const logger = createLogger('buildx');
  try {
    await ensureBuildxPlugin(logger);
    logger.success('Docker Buildx is ready.');
  } catch (error) {
    logger.error(`Failed to install Docker Buildx: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
