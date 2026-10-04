import {ServerLibrary,serverId,inviteAddress,inviteLink} from './server-library';
import {Shortcuts} from './shortcuts';
import {adminAction} from './admin';
import { diagnosticReport } from './diagnostics';
import { app, clipboard, dialog, Notification, BrowserWindow, ipcMain, net, protocol, session, powerMonitor } from 'electron';
import path from 'node:path';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import {Updates} from './updates';
import {parseServerConfig} from './server-config';
import {discoverServer,normalizeServerAddress} from './server-discovery';
import {X509Certificate} from 'node:crypto';
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
let pendingInvite:string|undefined;
function receiveInvite(value:string){try{pendingInvite=inviteAddress(value);window?.webContents.send(IPC.inviteEvent);}catch{/* External input never starts a connection. */}}
for(const argument of process.argv)if(argument.startsWith('discorda:'))receiveInvite(argument);
app.on('open-url',(event,url)=>{event.preventDefault();receiveInvite(url);});
if(app.isPackaged)app.setAsDefaultProtocolClient('discorda');
if(process.platform==='win32')app.setAppUserModelId('dev.discorda.desktop');

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event,argv) => { for(const argument of argv)if(argument.startsWith('discorda:'))receiveInvite(argument); window?.restore(); window?.focus(); });
  void app.whenReady().then(async () => {
    configureLanTrust();
    const library=new ServerLibrary(app.getPath('userData'));
    if(lan)await library.remember(lan).catch(()=>{});
    let lastNotification=0;
    ipcMain.handle(IPC.notifyMessage,(event,...args:unknown[])=>{assertSender(event,[]);if(args.length!==1||typeof args[0]!=='string'||!/^[0-9a-f-]{36}$/i.test(args[0]))throw Error('IPC request rejected');
      if(window?.isFocused()||Date.now()-lastNotification<5000||!Notification.isSupported())return;lastNotification=Date.now();
      const notification=new Notification({title:'Discorda',body:'Nova mensagem no seu grupo.',silent:true});notification.on('click',()=>{window?.restore();window?.show();window?.focus();});notification.show();
    });
    const auth = new AuthController(apiOrigin, new SessionVault(path.join(app.getPath('userData'), 'auth-session.enc')));
    ipcMain.handle(IPC.admin,(event,...args:unknown[])=>{assertSender(event,[]);if(args.length!==1)throw Error('IPC request rejected');return adminAction(auth,args[0],window!);});
    const shortcuts=new Shortcuts(value=>{if(window&&!window.isDestroyed())window.webContents.send(IPC.shortcutEvent,value);});
    ipcMain.handle(IPC.shortcuts,(event,...args:unknown[])=>{assertSender(event,[]);if(args.length!==1)throw Error('IPC request rejected');shortcuts.configure(args[0]);});
    app.on('before-quit',()=>shortcuts.stop());
    powerMonitor.on('suspend',()=>{shortcuts.stop();if(window&&!window.isDestroyed())window.webContents.send(IPC.powerState,'suspend');});
    const media = new MediaController(auth, () => window, development);
    const updates=new Updates(()=>media.callActive,async()=>apiOrigin?(await checkServices(apiOrigin)).serverProtocol:1);
    const updateTimer=setTimeout(()=>void updates.check(),30000);const updateInterval=setInterval(()=>void updates.check(),4*60*60*1000);
    app.on('before-quit',()=>{clearTimeout(updateTimer);clearInterval(updateInterval);});
    ipcMain.handle(IPC.updates,async(event,...args:unknown[])=>{assertSender(event,[]);if(args.length!==1||!['status','check','install','stable','beta'].includes(String(args[0])))throw new Error('IPC request rejected');if(args[0]==='stable'||args[0]==='beta')updates.setChannel(args[0]);if(args[0]==='check')void updates.check();if(args[0]==='install')await updates.install();return updates.snapshot();});
    app.on("before-quit", () => { void media.stop(); });
    const live = new LiveChatClient(apiOrigin, () => auth.liveToken(), event => {
      if (window && !window.isDestroyed()) window.webContents.send(IPC.liveEvent, event);
    }, () => powerMonitor.getSystemIdleTime() >= 300,lan);
    powerMonitor.on('resume',()=>{void live.reconnect();if(window&&!window.isDestroyed())window.webContents.send(IPC.powerState,'resume');});
    ipcMain.handle(IPC.reconnectLive,(event,...args:unknown[])=>{assertSender(event,args);return live.reconnect();});
    ipcMain.handle(IPC.diagnostics,async(event,...args:unknown[])=>{
      assertSender(event,[]);if(args.length!==1||!['status','export'].includes(String(args[0])))throw new Error('IPC request rejected');
      const health=await checkServices(apiOrigin);
      // Explicit allowlist: never serialize configuration, exceptions, URLs or account data.
      const report=diagnosticReport(app.getVersion(),process.platform,health,live.snapshot,media.callActive,updates.state.status);
      const metrics=app.getAppMetrics();report.performance={cpuPercent:Math.round(metrics.reduce((sum,p)=>sum+p.cpu.percentCPUUsage,0)*10)/10,memoryMiB:Math.round(metrics.reduce((sum,p)=>sum+p.memory.workingSetSize,0)/1024),processes:metrics.length};
      if(args[0]==='export'){
        const selection=await dialog.showSaveDialog(window!,{title:'Exportar diagnóstico privado',defaultPath:'discorda-diagnostico.json',filters:[{name:'JSON',extensions:['json']}]});
        if(!selection.canceled&&selection.filePath)await writeFile(selection.filePath,JSON.stringify(report,null,2),'utf8');
      }
      return report;
    });
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
      updates.confirmStartup();
      return { version: app.getVersion(), platform: process.platform,serverConfigured:!!apiOrigin,serverId:apiOrigin?serverId(apiOrigin):'unconfigured' };
    });
    let connectingServer=false;
    ipcMain.handle(IPC.connectServer,async(event,...args:unknown[])=>{
      assertSender(event,[]);
      if(args.length!==1)throw new Error('IPC request rejected');
      if(connectingServer)return {ok:false,message:'Aguarde a conexão em andamento.'};
      if(media.callActive)return {ok:false,message:'Saia da chamada antes de trocar de servidor.'};
      let ip:string;
      try{ip=typeof args[0]==='string'&&args[0].startsWith('discorda:')?inviteAddress(args[0]):normalizeServerAddress(args[0]);}catch(error){return {ok:false,message:(error as Error).message};}
      connectingServer=true;
      try {
        let config;
        try{config=await discoverServer(ip);}catch(error){return {ok:false,message:(error as Error).message};}
        const fingerprint=config.trust==='system'?undefined:new X509Certificate(config.certificate).fingerprint256;
        const confirmation=await dialog.showMessageBox(window!,{type:'question',title:'Conectar ao grupo',
          message:`Confiar no servidor ${ip}?`,
          detail:config.trust==='system'?'Confira se este é o domínio informado pelo administrador do grupo. O certificado HTTPS foi validado e poderá ser renovado automaticamente. O Discorda será reiniciado.':'Use o IP informado pelo administrador do grupo. Na primeira conexão, confira com ele a identificação abaixo. O aplicativo salvará este certificado e bloqueará mudanças inesperadas.\n\nIdentificação SHA-256:\n'+fingerprint+'\n\nO Discorda será reiniciado para conectar.',
          buttons:['Cancelar','Confiar e conectar'],defaultId:0,cancelId:0});
        if(confirmation.response!==1)return {ok:false,message:'Conexão cancelada.'};
        await live.stop();await media.stop();await auth.signOut();
        await mkdir(app.getPath('userData'),{recursive:true});
        await library.remember(config);await writeFile(path.join(app.getPath('userData'),'server.json'),JSON.stringify(config),{mode:0o600});
        app.relaunch();app.quit();return {ok:true};
      }catch{return {ok:false,message:'Não foi possível salvar a conexão. Tente novamente.'};}
      finally{connectingServer=false;}
    });
    ipcMain.handle(IPC.servers,async(event,...args:unknown[])=>{
      assertSender(event,[]);const action=args[0] as {kind?:string;id?:string;name?:string};
      if(args.length!==1||!action||typeof action!=='object'||!['list','invite','dismissInvite','select','remove','rename'].includes(action.kind??''))throw Error('Invalid server action');
      if(['select','remove','rename'].includes(action.kind!)&&(typeof action.id!=='string'||! /^[a-f0-9]{64}$/.test(action.id)))throw Error('Invalid server ID');
      if(action.kind==='dismissInvite')pendingInvite=undefined;
      if(action.kind==='rename'){
        if(typeof action.name!=='string'||!action.name.trim()||action.name.length>60||/[\x00-\x1f\x7f]/.test(action.name))throw Error('Nome inválido.');
        await library.change(items=>items.map(item=>item.id===action.id?{...item,name:action.name!.trim()}:item));
      }
      if(action.kind==='remove'){
        if(apiOrigin&&action.id===serverId(apiOrigin))throw Error('Troque de servidor antes de remover a conexão atual.');
        await library.change(items=>items.filter(item=>item.id!==action.id));
      }
      if(action.kind==='select'){
        if(connectingServer||media.callActive)throw Error('Saia da chamada e aguarde antes de trocar de servidor.');
        connectingServer=true;
        try{
          const entry=(await library.entries()).find(item=>item.id===action.id);if(!entry)throw Error('Servidor não encontrado.');
          const config=parseServerConfig(JSON.stringify(entry.config));
          const answer=await dialog.showMessageBox(window!,{type:'question',message:'Conectar a '+entry.name+'?',detail:config.apiUrl+'\nVocê sairá da conta atual. O aplicativo reiniciará.',buttons:['Cancelar','Trocar servidor'],defaultId:0,cancelId:0});
          if(answer.response===1){await live.stop();await media.stop();await auth.signOut();await writeFile(path.join(app.getPath('userData'),'server.json'),JSON.stringify(config),{mode:0o600});app.relaunch();app.quit();}
        }finally{connectingServer=false;}
      }
      if(action.kind==='invite'&&apiOrigin)clipboard.writeText(inviteLink(apiOrigin));
      return {servers:(await library.entries()).map(entry=>({id:entry.id,name:entry.name,address:entry.config.apiUrl,current:entry.config.apiUrl===apiOrigin})),pendingInvite, ...(action.kind==='invite'&&apiOrigin?{invite:inviteLink(apiOrigin)}:{})};
    });
    ipcMain.handle(IPC.importServer,async(event,...args:unknown[])=>{
      assertSender(event,args);
      if(media.callActive||connectingServer)throw Error('Saia da chamada antes de importar uma conexão.');
      connectingServer=true;
      try{
      const selection=await dialog.showOpenDialog(window!,{title:'Importar conexão privada do grupo',filters:[{name:'Configuração Discorda',extensions:['json']}],properties:['openFile']});
      if(selection.canceled)return false;
      let config;try{config=parseServerConfig(await readFile(selection.filePaths[0],'utf8'));}catch{throw new Error('Arquivo de conexão inválido. Peça uma configuração atualizada ao dono do grupo.');}
      if((await dialog.showMessageBox(window!,{type:'question',title:'Conectar ao grupo',message:'Confiar neste servidor?',detail:config.apiUrl+'\nImporte apenas arquivos enviados pelo dono do seu grupo. O aplicativo será reiniciado.',buttons:['Cancelar','Confiar e reiniciar'],defaultId:0,cancelId:0})).response!==1)return false;
      await live.stop();await media.stop();await auth.signOut();
      await mkdir(app.getPath('userData'),{recursive:true});await library.remember(config);await writeFile(path.join(app.getPath('userData'),'server.json'),JSON.stringify(config),{mode:0o600});app.relaunch();app.quit();return true;
      }finally{connectingServer=false;}
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
    ipcMain.handle(IPC.media, (event, ...args: unknown[]) => { assertSender(event, []); if (args.length !== 1) throw new Error('IPC request rejected'); if(connectingServer)return {ok:false,message:'Aguarde a troca de servidor.'}; return media.action(args[0]); });
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
      window.webContents.setWindowOpenHandler(details => {
        if(details.url!=='about:blank'||details.frameName!=='discorda-stream'||!media.callActive)return {action:'deny'};
        return {action:'allow',overrideBrowserWindowOptions:{title:'Transmissão · Discorda',autoHideMenuBar:true,width:1000,height:650,webPreferences:{preload:'',contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}}};
      });
      window.webContents.on('did-create-window',child=>{
        child.webContents.setWindowOpenHandler(()=>({action:'deny'}));
        child.webContents.on('will-navigate',event=>event.preventDefault());
        child.webContents.on('will-attach-webview',event=>event.preventDefault());
      });
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
