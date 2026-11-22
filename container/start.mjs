import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { createGateway } from './gateway.mjs';
import { createConnectController, createConnectHandler } from './connect.mjs';
import { ensureClaudeCode } from './claude-install.mjs';

if (!process.env.APP_PASSWORD) throw new Error('APP_PASSWORD must be supplied by Umbrel');
await mkdir('/home/node/projects', { recursive: true });

let stopping = false;
let restarting = false;
let backend;
const shutdown = new AbortController();

function startBackend() {
  backend = spawn('t3', ['serve', '--host', '127.0.0.1', '--port', '3773'], { stdio: ['ignore', 'inherit', 'inherit'] });
  backend.on('error', error => { console.error(error.message); process.exit(1); });
  backend.on('exit', code => {
    if (!restarting) { gateway.close(); process.exit(stopping ? 0 : code || 1); }
  });
}

const connect = createConnectController({
  restart: async () => {
    if (stopping) return;
    restarting = true;
    try {
      const current = backend;
      if (current && current.exitCode === null && current.signalCode === null) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { current.kill('SIGKILL'); reject(new Error('T3 server did not stop in time')); }, 20000);
          current.once('exit', () => { clearTimeout(timer); resolve(); });
          current.kill('SIGTERM');
        });
      }
      if (!stopping) startBackend();
    } finally { restarting = false; }
  },
});

const exec = promisify(execFile);
const gateway = createGateway({
  password: process.env.APP_PASSWORD,
  connectHandler: createConnectHandler({ password: process.env.APP_PASSWORD, controller: connect }),
  mint: async () => {
    const { stdout } = await exec('t3', ['auth', 'pairing', 'create', '--json', '--ttl', '5m', '--label', 'Umbrel browser'], { timeout: 30000, maxBuffer: 1024 * 1024 });
    const { credential } = JSON.parse(stdout);
    if (typeof credential !== 'string' || !credential) throw new Error('No pairing credential');
    return credential;
  },
});

gateway.listen(8080, '0.0.0.0');
startBackend();
void ensureClaudeCode({ signal: shutdown.signal });

function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  shutdown.abort();
  connect.stop();
  gateway.close();
  gateway.closeAllConnections();
  if (!backend || backend.exitCode !== null || backend.signalCode !== null) process.exit(0);
  backend.kill(signal);
  setTimeout(() => { backend.kill('SIGKILL'); process.exit(1); }, 20000).unref();
}
process.on('SIGTERM', () => stop());
process.on('SIGINT', () => stop('SIGINT'));
