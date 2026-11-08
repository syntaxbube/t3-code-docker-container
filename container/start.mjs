import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { createGateway } from './gateway.mjs';

if (!process.env.APP_PASSWORD) throw new Error('APP_PASSWORD must be supplied by Umbrel');
await mkdir('/home/node/projects', { recursive: true });
const backend = spawn('t3', ['serve', '--host', '127.0.0.1', '--port', '3773'], { stdio: ['ignore', 'inherit', 'inherit'] });
const exec = promisify(execFile);
const gateway = createGateway({
  password: process.env.APP_PASSWORD,
  mint: async () => {
    const { stdout } = await exec('t3', ['auth', 'pairing', 'create', '--json', '--ttl', '5m', '--label', 'Umbrel browser'], { timeout: 30000, maxBuffer: 1024 * 1024 });
    const { credential } = JSON.parse(stdout);
    if (typeof credential !== 'string' || !credential) throw new Error('No pairing credential');
    return credential;
  },
});
gateway.listen(8080, '0.0.0.0');
let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  gateway.close();
  gateway.closeAllConnections();
  backend.kill(signal);
  setTimeout(() => { backend.kill('SIGKILL'); process.exit(1); }, 20000).unref();
}
process.on('SIGTERM', () => stop());
process.on('SIGINT', () => stop('SIGINT'));
backend.on('error', error => { console.error(error.message); process.exit(1); });
backend.on('exit', code => { gateway.close(); process.exit(stopping ? 0 : code || 1); });
