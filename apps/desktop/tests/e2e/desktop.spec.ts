import { _electron as electron, expect, test } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'vite';

test('built desktop loads with a sandboxed preload and functional health action', async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.DISCORDA_DEV_SERVER_URL;
  const executablePath = process.env.DISCORDA_E2E_EXECUTABLE;
  if (executablePath) env.DISCORDA_API_URL = 'https://127.0.0.1:1';
  else env.DISCORDA_API_URL = 'http://127.0.0.1:1';
  const userData = await mkdtemp(path.join(os.tmpdir(), 'discorda-e2e-'));
  const app = await electron.launch({ executablePath, args: [...(executablePath ? [] : [path.resolve('.')]), `--user-data-dir=${userData}`], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('O seu grupo.');
    expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined');
    expect(await page.evaluate(() => Object.keys(window.discorda ?? {}).sort())).toEqual(['updates','importServer','voiceActivity','audioStatus','devicePermissions','audioApplications','applicationAudio','onApplicationAudio','onApplicationAudioEnd','microphoneTest', 'captureSources', 'media', 'selectCapture', 'cancelSignIn', 'chat', 'checkServices', 'getAppInfo', 'getAuthState', 'liveActivity', 'onLiveEvent', 'signIn', 'signOut', 'startLive', 'stopLive'].sort());
    // Electron exposes this diagnostic method at runtime but omits it from its public types.
    const preferences = await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents as unknown as {
        getLastWebPreferences(): { contextIsolation: boolean; sandbox: boolean; nodeIntegration: boolean };
      };
      return contents.getLastWebPreferences();
    });
    expect(preferences.contextIsolation).toBe(true);
    expect(preferences.sandbox).toBe(true);
    expect(preferences.nodeIntegration).toBe(false);
    await page.getByRole('button', { name: 'Verificar conexão' }).click();
    await expect(page.getByRole('region', { name: 'Conexão com os serviços' }).getByRole('status')).toContainText('Servidor indisponível');
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await expect(page.getByRole('region', { name: 'Sua conta' }).getByRole('status')).toContainText(/servidor|configurad/);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  } finally { await app.close(); }
});

test('development renderer loads through Vite with its development CSP', async () => {
  test.skip(Boolean(process.env.DISCORDA_E2E_EXECUTABLE), 'Development mode only');
  const server = await createServer();
  await server.listen();
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.DISCORDA_DEV_SERVER_URL = 'http://127.0.0.1:5173';
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'discorda-e2e-'));
    app = await electron.launch({ args: [path.resolve('.'), `--user-data-dir=${userData}`], env });
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('O seu grupo.');
    await expect(page.getByText('Desktop · v0.7.0')).toBeVisible();
  } finally {
    await app?.close();
    await server.close();
  }
});






