import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
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
} = {}) {
  if (env.T3_INSTALL_CLAUDE_CODE === '0') return 'disabled';
  const version = env.T3_CLAUDE_CODE_VERSION;
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) return 'no-version';
  try {
    const installed = JSON.parse(await readFile(`${prefix}/node_modules/${PACKAGE}/package.json`, 'utf8'));
    if (installed.version === version) return 'present';
  } catch {}
  log.log(`Installing Claude Code ${version} from npm into ${prefix} (first start; subject to Anthropic's terms)...`);
  try {
    await exec('npm', ['install', '--prefix', prefix, '--no-audit', '--no-fund', '--loglevel=error', `${PACKAGE}@${version}`], {
      timeout: 300000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return 'installed';
  } catch (error) {
    // Never block T3 Code from starting; Codex and the rest of the app keep working.
    log.error(`Claude Code install failed (${error.message.split('\n')[0]}). Retry by restarting, or run: npm install --prefix ${prefix} ${PACKAGE}@${version}`);
    return 'failed';
  }
}
