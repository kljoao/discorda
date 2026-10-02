import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

// Standalone loopback lab. Never accepts production URLs, API keys or user tokens.
const soakMinutes=Number(process.argv.find(arg=>arg.startsWith('--soak-minutes='))?.split('=')[1]??0);
if(!Number.isFinite(soakMinutes)||soakMinutes<0||soakMinutes>240)throw Error('Use --soak-minutes between 0 and 240.');
const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = path.join(root, 'artifacts/media-lab');
await mkdir(directory, { recursive: true });
const key = `lab${randomBytes(8).toString('hex')}`;
const secret = randomBytes(32).toString('hex');
const roomName = `probe-${randomUUID()}`;
const container = `discorda-media-${randomUUID().slice(0, 8)}`;
const config = path.join(directory, 'livekit.yaml');
const checkUi = process.argv.includes('--check-ui');
const interactive = process.argv.includes('--interactive') || checkUi;
const pagePaths = [`/${randomBytes(24).toString('hex')}/`, `/${randomBytes(24).toString('hex')}/`];
const native = process.platform === 'win32';
await writeFile(config, `port: 17880\nbind_addresses: ["${native ? '127.0.0.1' : '0.0.0.0'}"]\nrtc:\n  tcp_port: 17881\n  udp_port: 17882\n  node_ip: 127.0.0.1\n  use_external_ip: false\n  enable_loopback_candidate: true\nkeys:\n  ${key}: ${secret}\nroom:\n  auto_create: false\nlogging:\n  level: warn\n`);
function docker(args, allowFailure = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000, windowsHide: true });
  if (result.status !== 0 && !allowFailure) throw new Error(`Docker failed: ${result.stderr?.slice(-1500) ?? result.error?.message}`);
  return result.stdout;
}
let browser, http, serverProcess;
try {
  console.log('Starting isolated LiveKit 1.13.7 on loopback ports 17880–17882…');
  if (native) {
    const executable = path.join(directory, 'server/livekit-server.exe');
    if (!existsSync(executable)) throw new Error('Run powershell -File tools/media-lab/setup-windows.ps1 from the repository root first.');
    serverProcess = spawn(executable, ['--config', config], { windowsHide: true, stdio: 'ignore' });
    serverProcess.on('error', () => {});
  } else docker(['run', '-d', '--rm', '--name', container, '-p', '127.0.0.1:17880:17880/tcp', '-p', '127.0.0.1:17881:17881/tcp', '-p', '127.0.0.1:17882:17882/udp', '--mount', `type=bind,source=${config},target=/etc/livekit.yaml,readonly`, 'livekit/livekit-server:v1.13.7', '--config', '/etc/livekit.yaml']);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { ready = (await fetch('http://127.0.0.1:17880', { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Starting. */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Local LiveKit did not become ready.');
  const service = new RoomServiceClient('http://127.0.0.1:17880', key, secret);
  await service.createRoom({ name: roomName, maxParticipants: 2, emptyTimeout: 60 });
  const bundle = await build({ entryPoints: [fileURLToPath(new URL(interactive ? 'manual.js' : 'client.js', import.meta.url))], bundle: true, write: false, platform: 'browser', format: 'iife' });
  http = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (interactive) {
      const expectedOrigin = `http://127.0.0.1:${http.address().port}`;
      if (request.headers.host !== new URL(expectedOrigin).host || (request.headers.origin && request.headers.origin !== expectedOrigin)) { response.writeHead(403).end(); return; }
      const index = pagePaths.findIndex((prefix) => request.url === prefix || request.url === `${prefix}join` || request.url === `${prefix}client.js`);
      if (index < 0) { response.writeHead(404).end(); return; }
      if (request.url.endsWith('/join') && request.method === 'POST') {
        try {
          const token = new AccessToken(key, secret, { identity: `manual-${index}`, ttl: '10m' });
          token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: false });
          response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ url: 'ws://127.0.0.1:17880', token: await token.toJwt() }));
        } catch { response.writeHead(500).end(); }
        return;
      }
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      if (request.url.endsWith('/client.js')) { response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(bundle.outputFiles[0].text); return; }
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:17880 http://127.0.0.1:17880; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Discorda · Laboratório ${index + 1}</title><style>body{background:#101313;color:#edf3e9;font:16px system-ui;margin:40px;max-width:1000px}h1{color:#c7f38d}p{line-height:1.6}button{padding:12px 18px;margin:5px;border:1px solid #526047;border-radius:10px;background:#c7f38d;color:#142010;font:inherit}button:disabled{opacity:.4}#videos{display:flex;flex-wrap:wrap;gap:16px;margin-top:25px}video{width:440px;max-width:100%;background:#000;border-radius:12px}#status{padding:15px;border:1px solid #526047;border-radius:10px}</style><h1>Laboratório local · Cliente ${index + 1}</h1><p>Entre nas duas janelas para testar. Use fones e ligue apenas um microfone por vez para evitar retorno. Câmera, microfone e tela só são solicitados quando você clicar. Áudio da tela ainda não está incluído neste teste.</p><p id="status" role="status">Pronto para conectar.</p><p id="peers">0 participantes remotos</p><button id="connect">Conectar</button><button id="mic" data-action>Ligar microfone</button><button id="camera" data-action>Ligar câmera</button><button id="screen" data-action>Compartilhar tela</button><button id="leave" data-action>Sair</button><div id="videos"></div><script src="client.js"></script></html>`);
      return;
    }
    if (request.url === '/client.js') response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(bundle.outputFiles[0].text);
    else response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Discorda synthetic media lab</title><script src="/client.js"></script>');
  });
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: process.env.MEDIA_LAB_BROWSER ?? 'msedge', headless: !interactive || checkUi, args: ['--autoplay-policy=no-user-gesture-required'] });
  if (interactive) {
    const contexts = await Promise.all(pagePaths.map(() => browser.newContext()));
    for (const [index, context] of contexts.entries()) {
      const page = await context.newPage();

      await page.goto(`http://127.0.0.1:${http.address().port}${pagePaths[index]}`);
    }
    if (checkUi) {
      for (const context of contexts) {
        const page = context.pages()[0];
        await page.bringToFront();
        await page.getByRole('button', { name: 'Conectar', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'Conectado ao laboratório local.' }).waitFor({ timeout: 20000 }).catch(async (error) => { console.log(await page.locator('body').innerText()); throw error; });
      }
      for (const context of contexts) await context.pages()[0].getByText('1 participante(s) remoto(s)', { exact: true }).waitFor();
      await contexts[0].pages()[0].screenshot({ path: path.join(directory, 'manual.png'), fullPage: true });
      for (const context of contexts) {
        await context.pages()[0].getByRole('button', { name: 'Sair', exact: true }).click();
        await context.pages()[0].getByRole('status').filter({ hasText: 'Desconectado. Dispositivos liberados.' }).waitFor();
      }
      console.log('Manual UI passed: two connections, participant discovery, disconnect. No physical device was activated.');
    } else {
    console.log('Two local laboratory windows are ready. Close both windows to stop; automatic shutdown in 30 minutes.');
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 30 * 60_000);
      browser.once('disconnected', () => { clearTimeout(timer); resolve(); });
      process.once('SIGINT', () => { clearTimeout(timer); resolve(); });
      const interval = setInterval(() => { if (contexts.every((context) => context.pages().length === 0)) { clearTimeout(timer); resolve(); } }, 1000);
      browser.once('disconnected', () => clearInterval(interval));
      timer.unref();
      interval.unref();
    });
    }
  } else {
  const pages = [];
  for (const [index, color] of ['#668800', '#006688'].entries()) {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`http://127.0.0.1:${http.address().port}`);
    const token = new AccessToken(key, secret, { identity: `synthetic-${index}`, ttl: '5h' });
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: false });
    await page.evaluate((params) => window.startProbe(params), { url: 'ws://127.0.0.1:17880', token: await token.toJwt(), color });
    pages.push(page);
  }
  let samples;
  for (let attempt = 0; attempt < 30; attempt++) {
    samples = await Promise.all(pages.map((page) => page.evaluate(() => window.probeStats())));
    if (samples.every((sample) => sample.participants === 1 && sample.audioBytes > 1000 && sample.videoBytes > 1000 && sample.framesDecoded > 10)) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!samples.every((sample) => sample.audioBytes > 1000 && sample.videoBytes > 1000 && sample.framesDecoded > 10)) throw new Error(`Bidirectional media failed: ${JSON.stringify(samples)}`);
  const soakStart=Date.now();let checkpoints=0;let baseline=samples;
  if(soakMinutes>0)await pages[0].evaluate(()=>window.reconnectProbe());
  while(Date.now()-soakStart<soakMinutes*60000){
    await new Promise(resolve=>setTimeout(resolve,10000));
    samples=await Promise.all(pages.map(page=>page.evaluate(()=>window.probeStats())));
    if(!samples.every((sample,i)=>sample.participants===1&&sample.audioBytes>baseline[i].audioBytes&&sample.framesDecoded>baseline[i].framesDecoded))throw Error('Soak media stopped advancing.');
    baseline=samples;checkpoints++;console.log('Soak checkpoint '+checkpoints+': bidirectional media advancing.');
  }
  const stopped = await Promise.all(pages.map((page) => page.evaluate(() => window.stopProbe())));
  if (!stopped.every(Boolean)) throw new Error('A synthetic capture track remained active after disconnect.');
  const result = { testedAt: new Date().toISOString(), server: '1.13.7', soakMinutes, checkpoints, signalingReconnectExercised:soakMinutes>0, scope: 'loopback synthetic audio/video, two isolated browser contexts', samples, allTracksStopped: true, externalNetworksValidated: false, turnTlsValidated: false, physicalCaptureValidated: false };
  await writeFile(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await service.deleteRoom(roomName);
  }
} finally {
  await browser?.close();
  if (http) await new Promise((resolve) => http.close(resolve));
  if (serverProcess?.pid) {
    const exited = new Promise((resolve) => serverProcess.once('exit', resolve));
    if (serverProcess.exitCode === null) { serverProcess.kill(); await exited; }
  }
  if (!native) docker(['stop', container], true);
  await writeFile(config, '# Ephemeral lab credentials removed after execution.\n');
}







