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
  const browser = spawn(process.env.CHROMIUM_PATH, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  t.after(async () => {
    socket?.close();
    if (browser.exitCode === null && browser.signalCode === null) {
      const exited = once(browser, 'exit');
      browser.kill('SIGTERM');
      await exited;
    }
    gateway.closeAllConnections(); gateway.close();
    upstream.closeAllConnections(); upstream.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5 });
  });
  let output = '';
  const endpoint = await new Promise((resolve, reject) => {
    const fail = reason => reject(new Error(`${reason}\n--- chromium stderr ---\n${output.slice(-2000)}`));
    const timer = setTimeout(() => fail('Chromium did not expose DevTools'), 20000);
    browser.once('error', error => { clearTimeout(timer); reject(error); });
    browser.once('exit', (code, signal) => { clearTimeout(timer); fail(`Chromium exited early (code ${code}, signal ${signal})`); });
    browser.stderr.on('data', data => {
      output += data.toString();
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await once(socket, 'open');
  let sequence = 0;
  const pending = new Map();
  const loadWaiters = [];
  const failAll = err => {
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
    while (loadWaiters.length) loadWaiters.shift().reject(err);
  };
  socket.addEventListener('error', () => failAll(new Error('DevTools WebSocket error')));
  socket.addEventListener('close', () => failAll(new Error('DevTools WebSocket closed')));
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    } else if (message.method === 'Page.loadEventFired') {
      for (let i = loadWaiters.length - 1; i >= 0; i--) {
        if (loadWaiters[i].sessionId === message.sessionId) {
          const [waiter] = loadWaiters.splice(i, 1);
          waiter.resolve();
        }
      }
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
  const loaded = () => new Promise((resolve, reject) => loadWaiters.push({ sessionId, resolve, reject }));
  const firstLoad = loaded();
  await call('Page.navigate', { url: `${origin}/umbrel` });
  await firstLoad;
  for (const width of [1280, 390]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    const layout = await call('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth <= window.innerWidth', returnByValue: true });
    assert.equal(layout.result.value, true, `setup must fit ${width}px viewport`);
  }
  const submitted = loaded();
  await call('Runtime.evaluate', { expression: `document.querySelector('input[name=password]').value = 'secret'; document.querySelector('form').requestSubmit()` });
  await submitted;
  const result = await call('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
  assert.equal(submittedOrigin, origin, 'form navigation must send the real origin');
  assert.equal(result.result.value, 'Paired successfully');
});
