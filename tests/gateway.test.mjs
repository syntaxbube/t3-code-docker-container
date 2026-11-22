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
  const welcome = await fetch(`${origin}/umbrel?foo=1`);
  assert.equal(welcome.status, 200);
  assert.ok(Number(welcome.headers.get('content-length')) > 0);
  assert.doesNotMatch(welcome.headers.get('content-security-policy'), /font-src/);
  assert.match(await welcome.text(), /password/);
  const post = (password, requestOrigin = origin) => fetch(`${origin}/umbrel/pair`, { method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }), redirect: 'manual' });
  assert.equal((await post('wrong')).status, 403);
  assert.equal((await post('secret', 'http://evil.example')).status, 403);
  assert.equal((await post('secret', 'null')).status, 403);
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

test('pairing throttles repeated wrong password attempts', async (t) => {
  const gateway = createGateway({ password: 'secret', upstreamPort: 1, mint: async () => 'token' });
  await new Promise(r => gateway.listen(0, '127.0.0.1', r));
  t.after(() => { gateway.closeAllConnections(); gateway.close(); });
  const origin = `http://127.0.0.1:${gateway.address().port}`;
  const attempt = password => fetch(`${origin}/umbrel/pair`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password }),
    redirect: 'manual',
  });
  for (let i = 0; i < 5; i++) assert.equal((await attempt('wrong')).status, 403);
  assert.equal((await attempt('wrong')).status, 429);
  assert.equal((await attempt('secret')).status, 429);
});

test('backend abort terminates the proxied response without appending error text', async (t) => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-length': '10000' });
    res.write('hello');
    setTimeout(() => res.destroy(), 20);
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const gateway = createGateway({ password: 'secret', upstreamPort: upstream.address().port, mint: async () => 'token' });
  await new Promise(r => gateway.listen(0, '127.0.0.1', r));
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const result = await new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${gateway.address().port}/abort`, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('error', err => resolve({ complete: res.complete, body, err }));
      res.on('close', () => resolve({ complete: res.complete, body }));
    });
    req.on('error', err => resolve({ complete: false, body: '', err }));
  });
  assert.equal(result.complete, false);
  assert.doesNotMatch(result.body, /T3 Code is starting/);
});

test('proxy reuses keep-alive connections to upstream across sequential requests', async (t) => {
  let upstreamConnections = 0;
  const upstream = http.createServer((req, res) => res.end(req.url));
  upstream.on('connection', () => { upstreamConnections++; });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const gateway = createGateway({ password: 'secret', upstreamPort: upstream.address().port, mint: async () => 'token' });
  await new Promise(r => gateway.listen(0, '127.0.0.1', r));
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const origin = `http://127.0.0.1:${gateway.address().port}`;
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${origin}/item/${i}`, { headers: { connection: 'close' } });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), `/item/${i}`);
  }
  assert.equal(upstreamConnections, 1);
});
