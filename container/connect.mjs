import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';

const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash = text => createHash('sha256').update(text).digest();

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
      const timer = setTimeout(() => { append('\nSign-in timed out. Try Link again.'); child.kill('SIGTERM'); }, 15 * 60 * 1000);
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

export function createConnectHandler({ password, controller }) {
  return async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('referrer-policy', 'same-origin');
    res.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    let supplied = '';
    if (req.headers.authorization?.startsWith('Basic ')) {
      const credentials = Buffer.from(req.headers.authorization.slice(6), 'base64').toString();
      supplied = credentials.slice(credentials.indexOf(':') + 1);
    }
    if (!supplied || !timingSafeEqual(hash(supplied), hash(password))) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="T3 Connect setup", charset="UTF-8"' });
      return res.end('Sign in with username umbrel and the app password shown by Umbrel.');
    }
    if (req.method === 'POST') {
      let sameOrigin = false;
      try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch {}
      if (!sameOrigin) { res.writeHead(403); return res.end('Forbidden'); }
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 1024) { res.writeHead(413); return res.end('Request too large'); }
        }
        const action = new URLSearchParams(body).get('action');
        if (!['link', 'status', 'unlink'].includes(action)) { res.writeHead(400); return res.end('Unknown action'); }
        controller.run(action);
        res.writeHead(303, { location: '/umbrel/connect' });
        return res.end();
      } catch {
        if (!res.destroyed) { res.writeHead(400); res.end('Setup request interrupted. Reload and try again.'); }
        return;
      }
    }
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    const state = controller.snapshot();
    const urls = [...new Set(state.output.match(/https:\/\/[^\s<>"']+/g) ?? [])];
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">${state.running ? '<meta http-equiv="refresh" content="3">' : ''}<title>T3 Connect</title><style>body{font:18px system-ui;background:#141416;color:#eee;max-width:48rem;margin:8vh auto;padding:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#222;padding:20px}button{padding:12px;font:inherit;margin:8px}a{color:#adc8ff}</style><h1>T3 Connect</h1><p>Link opens a sign-in URL and device code below. Approve on your own device, then leave this page open until setup finishes.</p><p>Link and Disconnect restart T3 Code and interrupt running tasks. Your credentials and connection are saved across container restarts.</p><form method="post" action="/umbrel/connect"><button name="action" value="link" ${state.running ? 'disabled' : ''}>Link / sign in</button><button name="action" value="status" ${state.running ? 'disabled' : ''}>Status</button><button name="action" value="unlink" ${state.running ? 'disabled' : ''}>Disconnect</button></form><pre>${escape(state.output)}</pre>${urls.map(url => `<p><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">Open sign-in link</a></p>`).join('')}<p>Once connected, sign in to the same T3 account in the official desktop/mobile app or <a href="https://app.t3.codes" target="_blank" rel="noopener noreferrer">app.t3.codes</a>.</p><a href="/umbrel">Back to setup</a></html>`);
  };
}
