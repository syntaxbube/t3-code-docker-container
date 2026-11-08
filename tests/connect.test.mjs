import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createConnectHandler } from '../container/connect.mjs';

test('Connect setup protects device codes and mutations', async t => {
  const calls = [];
  const handler = createConnectHandler({ password: 'secret', controller: { snapshot: () => ({ running: true, output: '<script>bad</script> https://example.com/approve' }), run: action => calls.push(action) } });
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin)).status, 401);
  const authorization = 'Basic ' + Buffer.from('umbrel:secret').toString('base64');
  const page = await fetch(origin, { headers: { authorization } });
  const html = await page.text();
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const post = requestOrigin => fetch(origin, { method: 'POST', headers: { authorization, origin: requestOrigin }, body: 'action=link' });
  assert.equal((await post('http://evil.test')).status, 403);
  assert.equal(calls.length, 0);
  await fetch(origin, { method: 'POST', headers: { authorization, origin }, body: 'action=link', redirect: 'manual' });
  assert.deepEqual(calls, ['link']);
});

test('headless linking is single-flight and restarts only after success', async () => {
  const { EventEmitter } = await import('node:events');
  const { PassThrough } = await import('node:stream');
  const { createConnectController } = await import('../container/connect.mjs');
  const launches = [];
  let restarts = 0;
  const controller = createConnectController({ restart: async () => { restarts++; }, launch: (command, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => child.emit('close', 1);
    launches.push({ command, args, child }); return child;
  } });
  controller.run('link'); controller.run('link');
  assert.equal(launches.length, 1);
  assert.deepEqual(launches[0].args, ['connect', 'link', '--headless']);
  launches[0].child.stdout.write('Open https://example.com/authorize\nCode: TEST');
  assert.match(controller.snapshot().output, /Code: TEST/);
  launches[0].child.emit('close', 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(restarts, 1);
  assert.equal(controller.snapshot().running, false);
  controller.run('status'); launches[1].child.emit('close', 0);
  assert.equal(restarts, 1);
  controller.run('link'); launches[2].child.emit('close', 1);
  assert.equal(restarts, 1);
  assert.match(controller.snapshot().output, /Command failed/);
});
