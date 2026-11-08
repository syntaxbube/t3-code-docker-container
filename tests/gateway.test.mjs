import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createGateway } from '../container/gateway.mjs';

test('onboarding requires password and same-origin POST; proxy preserves HTTP and upgrades', async (t) => {
  const upstream = http.createServer((req, res) => { res.setHeader('set-cookie', 'native=session; HttpOnly'); res.end(req.url); });
  upstream.on('upgrade', (req, socket) => { socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'); socket.on('data', data => socket.write(data)); });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  let minted = 0;
  const gateway = createGateway({ password: 'secret', upstreamPort: upstream.address().port, mint: async () => { minted++; return 'one-time-token'; } });
  await new Promise(r => gateway.listen(0, '127.0.0.1', r));
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const origin = `http://127.0.0.1:${gateway.address().port}`;
  assert.match(await (await fetch(`${origin}/umbrel`)).text(), /password/);
  const post = (password, requestOrigin = origin) => fetch(`${origin}/umbrel/pair`, { method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }), redirect: 'manual' });
  assert.equal((await post('wrong')).status, 403);
  assert.equal((await post('secret', 'http://evil.example')).status, 403);
  assert.equal(minted, 0);
  const paired = await post('secret');
  assert.equal(paired.status, 303);
  assert.equal(paired.headers.get('location'), '/pair#token=one-time-token');
  assert.equal(paired.headers.get('cache-control'), 'no-store');
  const proxied = await fetch(`${origin}/native?test=1`);
  assert.equal(await proxied.text(), '/native?test=1');
  assert.match(proxied.headers.get('set-cookie'), /native=session/);
  await new Promise((resolve, reject) => {
    const socket = net.connect(gateway.address().port, '127.0.0.1');
    socket.setTimeout(3000, () => socket.destroy(new Error('upgrade timeout')));
    socket.on('error', reject);
    let upgraded = false;
    socket.on('data', data => {
      if (!upgraded) { assert.match(data.toString(), /101 Switching Protocols/); upgraded = true; socket.write('ping'); }
      else { assert.equal(data.toString(), 'ping'); socket.destroy(); resolve(); }
    });
    socket.on('connect', () => socket.write('GET /ws HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));
  });
});

test('backend abort terminates the proxied response', async (t) => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-length': '10000' });
    res.write('hello');
    setTimeout(() => res.destroy(), 20);
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const gateway = createGateway({ password: 'secret', upstreamPort: upstream.address().port, mint: async () => 'token' });
  await new Promise(r => gateway.listen(0, '127.0.0.1', r));
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(`http://127.0.0.1:${gateway.address().port}/abort`, { signal: controller.signal });
    await assert.rejects(response.text());
    assert.equal(controller.signal.aborted, false, 'gateway must close the response before client timeout');
  } finally { clearTimeout(timeout); }
});
