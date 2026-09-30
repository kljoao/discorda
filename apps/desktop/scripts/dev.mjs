import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';
import './build-electron.mjs';

const server = await createServer();
await server.listen();
const env = { ...process.env, DISCORDA_DEV_SERVER_URL: 'http://127.0.0.1:5173' };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.'], { stdio: 'inherit', env });
let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  child.kill();
  await server.close();
  process.exit(code);
}
child.on('error', (error) => { console.error(error.message); void close(1); });
child.on('exit', (code) => void close(code ?? 0));
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
