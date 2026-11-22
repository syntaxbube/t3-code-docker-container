import { spawn } from 'node:child_process';
import { createFailureLimiter, createPasswordVerifier, isSameOrigin, PayloadTooLargeError, readBody } from './http-utils.mjs';

const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createConnectController({ restart, launch = spawn }) {
  let child;
  let output = 'Select Status to check saved setup, or Link to sign in.';
  let running = false;
  return {
    snapshot: () => ({ running, output }),
    stop: () => child?.kill('SIGTERM'),
    run(action) {
      if (running) return;
      const args = { link: ['link', '--headless'], status: ['status', '--json'], unlink: ['unlink'] }[action];
      if (!args) throw new Error('Unknown Connect action');
      running = true;
      output = 'Starting T3 Connect…\n';
      child = launch('t3', ['connect', ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
      const append = data => { output = (output + data.toString().replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).slice(-32768); };
      child.stdout.on('data', append);
      child.stderr.on('data', append);
      const timer = setTimeout(() => { append('\nSign-in timed out. Try Link again.'); child.kill('SIGTERM'); }, 15 * 60 * 1000).unref();
      child.once('error', error => { clearTimeout(timer); append(error.message); running = false; });
      child.once('close', async code => {
        clearTimeout(timer);
        if (code === 0 && action !== 'status') {
          append('\nRestarting the T3 server to apply Connect settings…\n');
          try { await restart(); append('Server restarted. Select Status to check reachability.'); }
          catch (error) { append(`Restart failed: ${error.message}`); }
        } else if (code !== 0) append('\nCommand failed. Review the message above and retry.');
        running = false;
      });
    },
  };
}

function renderConnectPage(state) {
  const urls = [...new Set((state.output.match(/https:\/\/[^\s<>"']+/g) ?? []).map(u => u.replace(/[.,);]+$/, '')).filter(Boolean))];
  const disabled = state.running ? 'disabled' : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
${state.running ? '<meta http-equiv="refresh" content="3">\n' : ''}<title>T3 Connect</title>
<style>
:root{--bg:#0e0f11;--surface:#141518;--hover:#1e2025;--line:rgb(255 255 255/.08);--line-strong:rgb(255 255 255/.24);--t1:#ededef;--t2:#9b9ca3;--accent:#adc8ff;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;--mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:8vh auto;padding:24px;max-width:48rem;background:var(--bg);color:var(--t1);font:16px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
h1{font-size:26px;font-weight:500;letter-spacing:-.02em;margin:0 0 12px}
p{color:var(--t2);margin:0 0 12px}
code{font-family:var(--mono);color:var(--t1)}
form{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}
button{padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--t1);font:inherit;font-weight:500;cursor:pointer}
button:hover:not(:disabled){background:var(--hover);border-color:var(--line-strong)}
button:disabled{opacity:.5;cursor:not-allowed}
pre{margin:0 0 16px;padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--surface);font-family:var(--mono);font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head>
<body>
<h1>T3 Connect</h1>
<p>Sign in with username <code>umbrel</code> and your app password.</p>
<p>Link opens a sign-in URL and device code below. Approve on your own device, then leave this page open until setup finishes.</p>
<p>Link and Disconnect restart T3 Code and interrupt running tasks. Your credentials and connection are saved across container restarts.</p>
<form method="post" action="/umbrel/connect">
  <button name="action" value="link" ${disabled}>Link / sign in</button>
  <button name="action" value="status" ${disabled}>Status</button>
  <button name="action" value="unlink" ${disabled}>Disconnect</button>
</form>
<pre>${escape(state.output)}</pre>
${urls.map(url => `<p><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">Open sign-in link</a></p>`).join('\n')}
<p>Once connected, sign in to the same T3 account in the official desktop/mobile app or <a href="https://app.t3.codes" target="_blank" rel="noopener noreferrer">app.t3.codes</a>.</p>
<p><a href="/umbrel">Back to setup</a></p>
</body>
</html>`;
}

export function createConnectHandler({ password, controller }) {
  const verifyPassword = createPasswordVerifier(password);
  const failures = createFailureLimiter();
  return async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('referrer-policy', 'same-origin');
    res.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");

    const auth = req.headers.authorization;
    if (!auth?.startsWith('Basic ')) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="T3 Connect setup", charset="UTF-8"' });
      return res.end('Sign in with username umbrel and the app password shown by Umbrel.');
    }
    if (failures.isBlocked()) {
      res.writeHead(429);
      return res.end('Too many incorrect password attempts. Try again in a moment.');
    }
    const credentials = Buffer.from(auth.slice(6), 'base64').toString();
    const colon = credentials.indexOf(':');
    const supplied = colon === -1 ? '' : credentials.slice(colon + 1);
    if (!verifyPassword(supplied)) {
      failures.recordFailure();
      res.writeHead(401, { 'www-authenticate': 'Basic realm="T3 Connect setup", charset="UTF-8"' });
      return res.end('Sign in with username umbrel and the app password shown by Umbrel.');
    }
    failures.reset();

    if (req.method === 'POST') {
      if (!isSameOrigin(req)) { res.writeHead(403); return res.end('Forbidden'); }
      try {
        const body = await readBody(req, 1024);
        const action = new URLSearchParams(body).get('action');
        if (!['link', 'status', 'unlink'].includes(action)) { res.writeHead(400); return res.end('Unknown action'); }
        controller.run(action);
        res.writeHead(303, { location: '/umbrel/connect' });
        return res.end();
      } catch (error) {
        if (!res.destroyed) {
          if (error instanceof PayloadTooLargeError) {
            res.writeHead(413, { connection: 'close' });
            res.end('Request too large');
          } else {
            res.writeHead(400);
            res.end('Setup request interrupted. Reload and try again.');
          }
        }
        return;
      }
    }
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(renderConnectPage(controller.snapshot()));
  };
}
