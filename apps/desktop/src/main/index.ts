import { app, dialog, BrowserWindow, ipcMain, net, protocol, session, powerMonitor } from 'electron';
import path from 'node:path';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import {Updates} from './updates';
import {parseServerConfig} from './server-config';
import { pathToFileURL } from 'node:url';
import { APP_URL, DEV_URL, isTrustedDocument, resolveAssetPath, validateIpcCall } from './security';
import { checkServices, validateApiUrl } from './services';
import { IPC } from '../shared/ipc/contracts';
import { AuthController } from './auth/auth-controller';
import { SessionVault } from './auth/session-vault';
import { chatAction } from './chat';
import { lan, configureLanTrust } from './lan';
import { MediaController } from './media';
import { LiveChatClient } from './live-chat';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const development = !app.isPackaged && process.env.DISCORDA_DEV_SERVER_URL === DEV_URL;
const configuredApi = process.env.DISCORDA_API_URL ?? lan?.apiUrl ?? (!app.isPackaged ? 'http://127.0.0.1:5080' : undefined);
const apiOrigin = configuredApi ? validateApiUrl(configuredApi, app.isPackaged) : undefined;
let window: BrowserWindow | null = null;
if(process.platform==='win32')app.setAppUserModelId('dev.discorda.desktop');

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { window?.restore(); window?.focus(); });
  void app.whenReady().then(async () => {
    configureLanTrust();
    const auth = new AuthController(apiOrigin, new SessionVault(path.join(app.getPath('userData'), 'auth-session.enc')));
    const media = new MediaController(auth, () => window, development);
    const updates=new Updates(()=>media.callActive);
    const updateTimer=setTimeout(()=>void updates.check(),30000);const updateInterval=setInterval(()=>void updates.check(),4*60*60*1000);
    app.on('before-quit',()=>{clearTimeout(updateTimer);clearInterval(updateInterval);});
    ipcMain.handle(IPC.updates,async(event,...args:unknown[])=>{assertSender(event,[]);if(args.length!==1||!['status','check','install'].includes(String(args[0])))throw new Error('IPC request rejected');if(args[0]==='check')void updates.check();if(args[0]==='install')await updates.install();return updates.state;});
    app.on("before-quit", () => { void media.stop(); });
    const live = new LiveChatClient(apiOrigin, () => auth.liveToken(), event => {
      if (window && !window.isDestroyed()) window.webContents.send(IPC.liveEvent, event);
    }, () => powerMonitor.getSystemIdleTime() >= 300);
    app.on('before-quit', () => { void live.stop(); });
    app.on('before-quit', () => auth.cancel());
    const root = path.join(__dirname, '../renderer');
    protocol.handle('app', async (request) => {
      if (request.method !== 'GET') return new Response(null, { status: 405 });
      const target = resolveAssetPath(root, request.url);
      if (!target) return new Response(null, { status: 403 });
      try { return await net.fetch(pathToFileURL(target).toString()); }
      catch { return new Response(null, { status: 404 }); }
    });
    session.defaultSession.on('will-download', (event) => event.preventDefault());
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const csp = [
        "default-src 'self'", "script-src 'self'" + (development ? " 'unsafe-inline'" : ''), "style-src 'self'" + (development ? " 'unsafe-inline'" : ''),
        "media-src 'self' blob:", "img-src 'self' data: https://*.googleusercontent.com https://googleusercontent.com", "font-src 'self'", "object-src 'none'", "base-uri 'none'",
        "frame-src 'none'", "frame-ancestors 'none'", "form-action 'none'",
        `connect-src 'self'${lan ? ` ${lan.apiUrl} ${lan.apiUrl.replace('https:', 'wss:')}` : ''}${development ? ' ws://127.0.0.1:5173' : ''}`,
      ].join('; ');
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
    });

    let inFlight: ReturnType<typeof checkServices> | undefined;
    let cached: Awaited<ReturnType<typeof checkServices>> | undefined;
    let lastCheck = 0;
    ipcMain.handle(IPC.appInfo, (event, ...args: unknown[]) => {
      assertSender(event, args);
      return { version: app.getVersion(), platform: process.platform,serverConfigured:!!apiOrigin };
    });
    ipcMain.handle(IPC.importServer,async(event,...args:unknown[])=>{
      assertSender(event,args);
      const selection=await dialog.showOpenDialog(window!,{title:'Importar conexão privada do grupo',filters:[{name:'Configuração Discorda',extensions:['json']}],properties:['openFile']});
      if(selection.canceled)return false;
      let config;try{config=parseServerConfig(await readFile(selection.filePaths[0],'utf8'));}catch{throw new Error('Arquivo de conexão inválido. Peça uma configuração atualizada ao dono do grupo.');}
      if((await dialog.showMessageBox(window!,{type:'question',title:'Conectar ao grupo',message:'Confiar neste servidor?',detail:config.apiUrl+'\nImporte apenas arquivos enviados pelo dono do seu grupo. O aplicativo será reiniciado.',buttons:['Cancelar','Confiar e reiniciar'],defaultId:0,cancelId:0})).response!==1)return false;
      await live.stop();await media.stop();await auth.signOut();
      await mkdir(app.getPath('userData'),{recursive:true});await writeFile(path.join(app.getPath('userData'),'server.json'),JSON.stringify(config),{mode:0o600});app.relaunch();app.quit();return true;
    });
    ipcMain.handle(IPC.services, async (event, ...args: unknown[]) => {
      assertSender(event, args);
      if (cached && Date.now() - lastCheck < 2000) return cached;
      inFlight ??= checkServices(apiOrigin).then((result) => {
        cached = result;
        lastCheck = Date.now();
        return result;
      }).finally(() => { inFlight = undefined; });
      return inFlight;
    });
    ipcMain.handle(IPC.authState, (event, ...args: unknown[]) => { assertSender(event, args); return auth.state(); });
    ipcMain.handle(IPC.signIn, (event, ...args: unknown[]) => { assertSender(event, args); return auth.signIn(); });
    ipcMain.handle(IPC.cancelSignIn, (event, ...args: unknown[]) => { assertSender(event, args); auth.cancel(); });
    ipcMain.handle(IPC.signOut, async (event, ...args: unknown[]) => { assertSender(event, args); await media.stop(); await live.stop(); return auth.signOut(); });
    ipcMain.handle(IPC.media, (event, ...args: unknown[]) => { assertSender(event, []); if (args.length !== 1) throw new Error('IPC request rejected'); return media.action(args[0]); });
    ipcMain.handle(IPC.devicePermissions,(event,...args:unknown[])=>{assertSender(event,[]);if(args.length!==1)throw new Error('IPC request rejected');return media.devicePermissions(args[0]);});
    ipcMain.handle(IPC.audioStatus,(event,...args:unknown[])=>{assertSender(event,args);return media.audio.status();});
    ipcMain.handle(IPC.audioApplications,(event,...args:unknown[])=>{assertSender(event,args);return media.audio.list();});
    ipcMain.handle(IPC.applicationAudio,(event,...args:unknown[])=>{assertSender(event,[]);if(args.length!==1||!args[0]||typeof args[0]!=='object')throw new Error('IPC request rejected');const action=args[0] as {kind?:unknown;id?:unknown};if(action.kind==='start')return media.audio.start(action.id);if(action.kind==='stop')return media.audio.stop();if(action.kind==='pulse')return media.audio.pulse();throw new Error('IPC request rejected');});
    ipcMain.handle(IPC.microphoneTest, (event, ...args: unknown[]) => { assertSender(event, []); if (args.length !== 1 || typeof args[0] !== 'boolean') throw new Error('IPC request rejected'); return media.testMicrophone(args[0]); });
    ipcMain.handle(IPC.captureSources, (event, ...args: unknown[]) => { assertSender(event, args); return media.listSources(); });
    ipcMain.handle(IPC.selectCapture, (event, ...args: unknown[]) => { assertSender(event, []); if (args.length !== 2) throw new Error('IPC request rejected'); media.selectSource(args[0], args[1]); });
    ipcMain.handle(IPC.liveStart, (event, ...args: unknown[]) => { assertSender(event, args); live.start(); });
    ipcMain.handle(IPC.liveStop, (event, ...args: unknown[]) => { assertSender(event, args); return live.stop(); });
    ipcMain.handle(IPC.voiceActivity,(event,...args:unknown[])=>{assertSender(event,[]);if(args.length!==2)throw new Error('IPC request rejected');return live.voiceActivity(args[0],args[1]);});
    ipcMain.handle(IPC.liveActivity, (event, ...args: unknown[]) => { assertSender(event, []); if (args.length !== 2) throw new Error('IPC request rejected'); live.activity(args[0], args[1]); });
    ipcMain.handle(IPC.chat, (event, ...args: unknown[]) => {
      assertSender(event, []);
      if (args.length !== 1) throw new Error('IPC request rejected');
      return chatAction(auth, args[0]);
    });

    function assertSender(event: Electron.IpcMainInvokeEvent, args: unknown[]) {
      validateIpcCall({
        senderId: event.sender.id, windowId: window?.webContents.id ?? -1,
        mainFrame: event.senderFrame === event.sender.mainFrame,
        url: event.senderFrame?.url ?? '', development, args,
      });
    }
    function createWindow() {
      window = new BrowserWindow({
        width: 1240, height: 820, minWidth: 840, minHeight: 620,
        icon:path.join(app.getAppPath(),'resources','icon.png'), backgroundColor: '#161619', title: 'Discorda', show: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.cjs'),
          contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        if (!isTrustedDocument(url, development)) event.preventDefault();
      });
      window.webContents.on('will-attach-webview', (event) => event.preventDefault());
      window.once('ready-to-show', () => window?.show());
      window.on('closed', () => { auth.cancel(); void media.stop(); void live.stop(); window = null; });
      void window.loadURL(development ? DEV_URL : APP_URL);
    }
    createWindow();
    app.on('activate', () => { if (!window) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
