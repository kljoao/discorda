import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { AuthError } from './auth-error';

export interface LoginCallback { redirectTo: string; code: Promise<string>; close(): void; }

export async function listenForLogin(signal: AbortSignal, port = 3000, timeoutMs = 300_000): Promise<LoginCallback> {
  const route = `/redirect/${randomBytes(32).toString('hex')}`;
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const code = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  // A browser-open error may occur before the caller awaits code.
  void code.catch(() => undefined);
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('Referrer-Policy', 'no-referrer');
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    if (request.method !== 'GET' || request.headers.host !== `127.0.0.1:${actualPort}` || request.headers.origin) {
      response.writeHead(403).end(); return;
    }
    let url: URL;
    try { url = new URL(request.url ?? '/', `http://127.0.0.1:${actualPort}`); }
    catch { response.writeHead(400).end(); return; }
    if (url.pathname !== route || settled) { response.writeHead(404).end(); return; }
    if (url.searchParams.has('error')) {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Login cancelado. Volte ao Discorda.');
      finish(new AuthError('O login não foi concluído.')); return;
    }
    const values = url.searchParams.getAll('code');
    if (values.length !== 1 || !values[0] || values[0].length > 2048) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não foi possível concluir o login. Volte ao Discorda, cancele a tentativa e tente novamente.');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Volte ao Discorda para concluir a entrada. Você pode fechar esta aba.');
    finish(undefined, values[0]);
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  const abort = () => finish(new AuthError('Login cancelado.'));
  function finish(error?: Error, value?: string) {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    server.close();
    server.closeIdleConnections();
    if (error) rejectCode(error); else resolveCode(value!);
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
  } catch {
    finish(new AuthError('A porta local de login está ocupada. Feche o outro aplicativo que usa a porta 3000 e tente novamente.'));
    return await code as never;
  }
  server.on('error', () => finish(new AuthError('Não foi possível receber o retorno do login.')));
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  else timer = setTimeout(() => finish(new AuthError('O tempo para entrar terminou. Tente novamente.')), timeoutMs);
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return { redirectTo: `http://127.0.0.1:${actualPort}${route}`, code, close: abort };
}
