import http from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';

const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>T3 Code on Umbrel</title><style>body{font:18px system-ui;background:#141416;color:#eee;max-width:36rem;margin:12vh auto;padding:24px}input,button{font:inherit;padding:12px;margin:8px 0;display:block;width:100%;box-sizing:border-box}button{cursor:pointer}a{color:#adc8ff}</style><h1>T3 Code</h1><p>Connect this browser using the password shown in the Umbrel app details.</p><form method="post" action="/umbrel/pair"><label>App password<input type="password" name="password" autocomplete="current-password" required></label><button>Connect to T3 Code</button></form><p>Already connected? <a href="/">Open T3 Code</a>.</p><p>After connecting, enable Codex or Claude in Settings → Providers and sign in. Create projects inside <code>/home/node/projects</code> to keep your work across upgrades.</p></html>`;
const digest = value => createHash('sha256').update(value).digest();

export function createGateway({ password, upstreamPort = 3773, mint }) {
  if (!password) throw new Error('APP_PASSWORD must be set');
  let lastAttempt = 0;
  const target = { hostname: '127.0.0.1', port: upstreamPort };
  const server = http.createServer(async (req, res) => {
    if (req.url === '/umbrel' || req.url === '/umbrel/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'", 'referrer-policy': 'no-referrer' });
      return res.end(page);
    }
    if (req.url === '/umbrel/pair') {
      res.setHeader('cache-control', 'no-store');
      const origin = req.headers.origin;
      // Check host only: Umbrel may terminate HTTPS before forwarding HTTP.
      let sameOrigin = false;
      try { sameOrigin = new URL(origin).host === req.headers.host; } catch {}
      if (req.method !== 'POST' || !sameOrigin) { res.writeHead(403); return res.end('Forbidden'); }
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4096) { res.writeHead(413); res.end('Request too large'); return; }
        }
        if (!timingSafeEqual(digest(new URLSearchParams(body).get('password') ?? ''), digest(password))) {
          res.writeHead(403); return res.end('Incorrect app password. Return to /umbrel and try again.');
        }
        if (Date.now() - lastAttempt < 1000) { res.writeHead(429); return res.end('Try again in a moment.'); }
        lastAttempt = Date.now();
        const token = await mint();
        res.writeHead(303, { location: `/pair#token=${encodeURIComponent(token)}` });
        return res.end();
      } catch {
        res.writeHead(503); return res.end('T3 Code is starting. Return to /umbrel and try again shortly.');
      }
    }
    const proxy = http.request({ ...target, path: req.url, method: req.method, headers: req.headers }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    });
    proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('T3 Code is starting. Please retry shortly.'); });
    req.on('aborted', () => proxy.destroy());
    res.on('close', () => proxy.destroy());
    req.pipe(proxy);
  });
  server.on('upgrade', (req, socket, head) => {
    const proxy = http.request({ ...target, path: req.url, headers: req.headers });
    proxy.on('upgrade', (response, upstream, upstreamHead) => {
      socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`);
      for (let i = 0; i < response.rawHeaders.length; i += 2) socket.write(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}\r\n`);
      socket.write('\r\n');
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) upstream.write(head);
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
      socket.on('close', () => upstream.destroy());
      socket.on('end', () => upstream.destroy());
      upstream.on('close', () => socket.destroy());
      upstream.on('end', () => socket.destroy());
      socket.pipe(upstream).pipe(socket);
    });
    proxy.on('response', response => { socket.end(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\nConnection: close\r\n\r\n`); response.resume(); });
    proxy.on('error', () => socket.destroy());
    socket.on('error', () => proxy.destroy());
    proxy.end();
  });
  return server;
}
