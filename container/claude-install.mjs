import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const PACKAGE = '@anthropic-ai/claude-code';

// Claude Code is proprietary software and is not redistributed in the container image.
// It is downloaded from the npm registry into the user's own persistent storage so the
// user obtains it directly from Anthropic under their own terms.
export async function ensureClaudeCode({
  env = process.env,
  prefix = '/home/node/.claude-cli',
  exec = run,
  log = console,
  signal,
} = {}) {
  if (env.T3_INSTALL_CLAUDE_CODE === '0') return 'disabled';
  const version = env.T3_CLAUDE_CODE_VERSION;
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) return 'no-version';
  try {
    const installed = JSON.parse(await readFile(`${prefix}/node_modules/${PACKAGE}/package.json`, 'utf8'));
    if (installed.version === version) {
      await access(`${prefix}/node_modules/.bin/claude`);
      return 'present';
    }
  } catch {}
  if (signal?.aborted) return 'aborted';
  log.log(`Installing Claude Code ${version} from npm into ${prefix} (first start; subject to Anthropic's terms)...`);
  const cacheDir = await mkdtemp(join(tmpdir(), 'claude-npm-cache-'));
  try {
    await exec(
      'npm',
      ['install', '--prefix', prefix, '--no-audit', '--no-fund', '--no-package-lock', '--cache', cacheDir, '--loglevel=error', `${PACKAGE}@${version}`],
      {
        timeout: 300000,
        maxBuffer: 4 * 1024 * 1024,
        ...(signal ? { signal } : {}),
      },
    );
    log.log(`Claude Code ${version} installed in ${prefix}.`);
    return 'installed';
  } catch (error) {
    if (signal?.aborted) return 'aborted';
    // Never block T3 Code from starting; Codex and the rest of the app keep working.
    log.error(`Claude Code install failed (${error.message.split('\n')[0]}). Retry by restarting, or run: npm install --prefix ${prefix} ${PACKAGE}@${version}`);
    return 'failed';
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
}
