#!/usr/bin/env bun
import fs from 'node:fs/promises';
import path from 'node:path';
import { bootstrapCli } from './ops';
import { createLogger } from '../apps/web/lib/cli';

const logger = createLogger('install');

const usage = () => {
  console.log(`Usage: bun run scripts/install.ts <domain> [acme-email]

Required env vars:
  GITHUB_USER   GitHub username with access to the repo
  GITHUB_PAT    GitHub personal access token with repo scope

Optional env vars:
  ACME_EMAIL    TLS email fallback (if second argument omitted)
  APP_DIR       Install directory (default: ~/Hotz_Private_AI_Lab)
`);
};

const args = Bun.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  usage();
  process.exit(args.length ? 0 : 1);
}

const requireEnv = (key: string): string => {
  const value = Bun.env[key];
  if (!value) {
    throw new Error(`${key} environment variable required`);
  }
  return value;
};

const domainArg = args[0];
const acmeEmail = args[1] || Bun.env.ACME_EMAIL || '';
if (!acmeEmail) {
  throw new Error('ACME email required (pass as second argument or set ACME_EMAIL env)');
}

const githubUser = requireEnv('GITHUB_USER');
const githubPat = requireEnv('GITHUB_PAT');

const appDir =
  Bun.env.APP_DIR || path.join(Bun.env.HOME || process.env.HOME || '/root', 'Hotz_Private_AI_Lab');

const exec = async (cmd: string[]) => {
  const proc = Bun.spawn({
    cmd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Command failed (${cmd.join(' ')}), exit code ${code}`);
  }
};

const ensureSystemDeps = async () => {
  logger.info('Installing system dependencies…');
  await exec(['sudo', 'apt-get', 'update', '-y']);
  await exec([
    'sudo',
    'apt-get',
    'install',
    '-y',
    'git',
    'curl',
    'ca-certificates',
    'docker.io',
    'docker-compose-plugin',
  ]);
  await exec(['sudo', 'systemctl', 'enable', '--now', 'docker']);
};

const cloneRepo = async () => {
  logger.info(`Cloning Hotz_Private_AI_Lab into ${appDir}…`);
  await fs.rm(appDir, { recursive: true, force: true });
  const authUser = encodeURIComponent(githubUser);
  const authPat = encodeURIComponent(githubPat);
  const repoUrl = `https://${authUser}:${authPat}@github.com/aytekaksu/Hotz_Private_AI_Lab.git`;
  await exec(['git', 'clone', '--branch', 'clean-install', repoUrl, appDir]);
};

const main = async () => {
  await ensureSystemDeps();

  if (!(await fs
    .access(appDir)
    .then(() => true)
    .catch(() => false))) {
    await cloneRepo();
  } else {
    logger.warn(`${appDir} already exists; skipping clone.`);
  }

  process.chdir(appDir);
  process.env.ACME_EMAIL = acmeEmail;
  await bootstrapCli([domainArg, acmeEmail]);
};

main().catch((error) => {
  logger.error('Installer failed:', (error as Error).message);
  process.exitCode = 1;
});
