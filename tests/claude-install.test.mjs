import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureClaudeCode } from '../container/claude-install.mjs';

const quiet = { log() {}, error() {} };

test('does nothing when disabled or no valid version is pinned', async () => {
  const exec = async () => assert.fail('must not run npm');
  assert.equal(await ensureClaudeCode({ env: { T3_INSTALL_CLAUDE_CODE: '0', T3_CLAUDE_CODE_VERSION: '1.2.3' }, exec, log: quiet }), 'disabled');
  assert.equal(await ensureClaudeCode({ env: {}, exec, log: quiet }), 'no-version');
  assert.equal(await ensureClaudeCode({ env: { T3_CLAUDE_CODE_VERSION: '1.2.3; rm -rf /' }, exec, log: quiet }), 'no-version');
});

test('installs the pinned version into the persistent prefix, once', async () => {
  const prefix = await mkdtemp(join(tmpdir(), 'claude-'));
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push([cmd, args]);
    const dir = join(prefix, 'node_modules/@anthropic-ai/claude-code');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  };
  const env = { T3_CLAUDE_CODE_VERSION: '1.2.3' };
  assert.equal(await ensureClaudeCode({ env, prefix, exec, log: quiet }), 'installed');
  assert.equal(calls[0][0], 'npm');
  assert.ok(calls[0][1].includes('@anthropic-ai/claude-code@1.2.3'));
  assert.ok(calls[0][1].includes(prefix));
  assert.equal(await ensureClaudeCode({ env, prefix, exec, log: quiet }), 'present');
  assert.equal(calls.length, 1);
});

test('install failure is non-fatal', async () => {
  const prefix = await mkdtemp(join(tmpdir(), 'claude-'));
  const exec = async () => { throw new Error('network down'); };
  assert.equal(await ensureClaudeCode({ env: { T3_CLAUDE_CODE_VERSION: '1.2.3' }, prefix, exec, log: quiet }), 'failed');
});
