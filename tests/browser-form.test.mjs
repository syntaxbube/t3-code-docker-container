import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createGateway } from '../container/gateway.mjs';

// Exercise a real HTML form navigation: fetch() does not reproduce browser
// Origin handling under Referrer-Policy, which caused the first pairing bug.
test('browser form submission preserves its origin and pairs successfully', { skip: !process.env.CHROMIUM_PATH, timeout: 30000 }, async (t) => {
  const upstream = http.createServer((req, res) => res.end('Paired successfully'));
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  let submittedOrigin;
  const gateway = createGateway({ password: 'secret', upstreamPort: upstream.address().port, mint: async () => 'browser-token' });
  gateway.on('request', req => { if (req.url === '/umbrel/pair') submittedOrigin = req.headers.origin; });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${gateway.address().port}`;
  const profile = await mkdtemp(join(tmpdir(), 't3-browser-test-'));
  const browser = spawn(process.env.CHROMIUM_PATH, ['--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  t.after(async () => {
    socket?.close();
    const exited = once(browser, 'exit');
    browser.kill('SIGTERM');
    await exited;
    gateway.closeAllConnections(); gateway.close();
    upstream.closeAllConnections(); upstream.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5 });
  });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chromium did not expose DevTools')), 10000);
    browser.once('error', reject);
    browser.stderr.on('data', data => {
      const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await once(socket, 'open');
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  });
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => command(method, params, sessionId);
  await call('Page.enable');
  const loaded = () => new Promise(resolve => {
    const listener = event => {
      const message = JSON.parse(event.data);
      if (message.sessionId === sessionId && message.method === 'Page.loadEventFired') {
        socket.removeEventListener('message', listener); resolve();
      }
    };
    socket.addEventListener('message', listener);
  });
  const firstLoad = loaded();
  await call('Page.navigate', { url: `${origin}/umbrel` });
  await firstLoad;
  const submitted = loaded();
  await call('Runtime.evaluate', { expression: `document.querySelector('input[name=password]').value = 'secret'; document.querySelector('form').requestSubmit()` });
  await submitted;
  const result = await call('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
  assert.equal(submittedOrigin, origin, 'form navigation must send the real origin');
  assert.equal(result.result.value, 'Paired successfully');
});
