import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createFailureLimiter, createPasswordVerifier, isSameOrigin, PayloadTooLargeError, readBody } from './http-utils.mjs';

const welcomeHtml = readFileSync(new URL('./welcome.html', import.meta.url));
const WELCOME_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'content-length': String(welcomeHtml.byteLength),
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'",
  'referrer-policy': 'same-origin',
};

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

function forwardHeaders(headers) {
  const connection = typeof headers.connection === 'string'
    ? new Set(headers.connection.split(',').map(name => name.trim().toLowerCase()).filter(Boolean))
    : null;
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || connection?.has(lower)) continue;
    out[key] = value;
  }
  return out;
}

export function createGateway({ password, upstreamPort = 3773, mint, connectHandler }) {
  const verifyPassword = createPasswordVerifier(password);
  const failures = createFailureLimiter();
  let lastMint = 0;
  const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });
  const target = { hostname: '127.0.0.1', port: upstreamPort };

  const server = http.createServer(async (req, res) => {
    const pathname = (req.url || '/').split('?', 1)[0];
    if (pathname === '/umbrel/connect' && connectHandler) return connectHandler(req, res);
    if (pathname === '/umbrel' || pathname === '/umbrel/') {
      res.writeHead(200, WELCOME_HEADERS);
      return res.end(welcomeHtml);
    }
    if (pathname === '/umbrel/pair') {
      res.setHeader('cache-control', 'no-store');
      // Check host only: Umbrel may terminate HTTPS before forwarding HTTP.
      if (req.method !== 'POST' || !isSameOrigin(req)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }
      if (failures.isBlocked()) {
        res.writeHead(429);
        return res.end('Try again in a moment.');
      }
      try {
        const body = await readBody(req, 4096);
        const supplied = new URLSearchParams(body).get('password') ?? '';
        if (!verifyPassword(supplied)) {
          failures.recordFailure();
          res.writeHead(403);
          return res.end('Incorrect app password. Return to /umbrel and try again.');
        }
        failures.reset();
        const now = Date.now();
        if (now - lastMint < 1000) {
          res.writeHead(429);
          return res.end('Try again in a moment.');
        }
        lastMint = now;
        const token = await mint();
        res.writeHead(303, { location: `/pair#token=${encodeURIComponent(token)}` });
        return res.end();
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          res.writeHead(413, { connection: 'close' });
          return res.end('Request too large');
        }
        res.writeHead(503);
        return res.end('T3 Code is starting. Return to /umbrel and try again shortly.');
      }
    }

    const proxy = http.request(
      { ...target, agent, path: req.url, method: req.method, headers: forwardHeaders(req.headers) },
      upstream => {
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.on('aborted', () => res.destroy());
        upstream.on('error', () => res.destroy());
        upstream.on('close', () => {
          if (!upstream.complete && !res.writableEnded) res.destroy();
        });
        upstream.pipe(res);
      },
    );
    proxy.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('T3 Code is starting. Please retry shortly.');
      } else {
        res.destroy();
      }
    });
    res.on('close', () => {
      if (!res.writableEnded) proxy.destroy();
    });
    req.pipe(proxy);
  });

  server.on('upgrade', (req, socket, head) => {
    const proxy = http.request({ ...target, agent: false, path: req.url, method: req.method, headers: req.headers });
    const abortProxy = () => proxy.destroy();
    socket.on('error', abortProxy);
    socket.on('close', abortProxy);

    proxy.on('upgrade', (response, upstream, upstreamHead) => {
      socket.off('error', abortProxy);
      socket.off('close', abortProxy);
      let raw = `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`;
      for (let i = 0; i < response.rawHeaders.length; i += 2) {
        raw += `${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}\r\n`;
      }
      raw += '\r\n';
      socket.write(raw);
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

    proxy.on('response', response => {
      socket.off('error', abortProxy);
      socket.off('close', abortProxy);
      socket.end(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
      response.resume();
    });
    proxy.on('error', () => socket.destroy());
    proxy.end();
  });

  server.on('close', () => agent.destroy());
  return server;
}
