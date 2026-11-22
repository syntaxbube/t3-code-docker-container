import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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

test('installs the pinned version into the persistent prefix once with isolated cache', async t => {
  const prefix = await mkdtemp(join(tmpdir(), 'claude-'));
  t.after(() => rm(prefix, { recursive: true, force: true }));
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push([cmd, args]);
    const dir = join(prefix, 'node_modules/@anthropic-ai/claude-code');
    const binDir = join(prefix, 'node_modules/.bin');
    await mkdir(dir, { recursive: true });
    await mkdir(binDir, { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    await writeFile(join(binDir, 'claude'), '');
  };
  const env = { T3_CLAUDE_CODE_VERSION: '1.2.3' };
  assert.equal(await ensureClaudeCode({ env, prefix, exec, log: quiet }), 'installed');
  assert.equal(calls[0][0], 'npm');
  assert.ok(calls[0][1].includes('@anthropic-ai/claude-code@1.2.3'));
  assert.ok(calls[0][1].includes(prefix));
  assert.ok(calls[0][1].includes('--no-package-lock'));
  const cacheIndex = calls[0][1].indexOf('--cache');
  assert.notEqual(cacheIndex, -1);
  const cacheDir = calls[0][1][cacheIndex + 1];
  await assert.rejects(access(cacheDir));
  assert.equal(await ensureClaudeCode({ env, prefix, exec, log: quiet }), 'present');
  assert.equal(calls.length, 1);
});

test('missing binary triggers reinstall even when package.json version matches', async t => {
  const prefix = await mkdtemp(join(tmpdir(), 'claude-'));
  t.after(() => rm(prefix, { recursive: true, force: true }));
  const pkgDir = join(prefix, 'node_modules/@anthropic-ai/claude-code');
  await mkdir(pkgDir, { recursive: true });
  await writeFile(join(pkgDir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  let installed = 0;
  const exec = async () => {
    installed++;
    await mkdir(join(prefix, 'node_modules/.bin'), { recursive: true });
    await writeFile(join(prefix, 'node_modules/.bin/claude'), '');
  };
  assert.equal(await ensureClaudeCode({ env: { T3_CLAUDE_CODE_VERSION: '1.2.3' }, prefix, exec, log: quiet }), 'installed');
  assert.equal(installed, 1);
  assert.equal(await ensureClaudeCode({ env: { T3_CLAUDE_CODE_VERSION: '1.2.3' }, prefix, exec, log: quiet }), 'present');
  assert.equal(installed, 1);
});

test('pre-aborted signal skips install cleanly', async t => {
  const prefix = await mkdtemp(join(tmpdir(), 'claude-'));
  t.after(() => rm(prefix, { recursive: true, force: true }));
  const controller = new AbortController();
  controller.abort();
  const exec = async () => assert.fail('must not run npm when aborted');
  assert.equal(
    await ensureClaudeCode({ env: { T3_CLAUDE_CODE_VERSION: '1.2.3' }, prefix, exec, log: quiet, signal: controller.signal }),
    'aborted',
  );
});

test('install failure is non-fatal', async t => {
  const prefix = await mkdtemp(join(tmpdir(), 'claude-'));
  t.after(() => rm(prefix, { recursive: true, force: true }));
  const exec = async () => { throw new Error('network down'); };
  assert.equal(await ensureClaudeCode({ env: { T3_CLAUDE_CODE_VERSION: '1.2.3' }, prefix, exec, log: quiet }), 'failed');
});
