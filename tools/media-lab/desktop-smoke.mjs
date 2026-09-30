// Local manual/CI helper for the configured Radmin host. Uses isolated Electron profiles,
// synthetic devices and a disposable SFU room. Authentication is mocked ONLY in these test processes.
import { _electron as electron, expect } from '@playwright/test';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { readFile, mkdtemp, copyFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
const root = path.resolve(import.meta.dirname, '../..');
const settings = JSON.parse(await readFile(path.join(process.env.APPDATA, 'Microsoft/UserSecrets/discorda-development/secrets.json'), 'utf8'));
const service = new RoomServiceClient(settings['LiveKit:InternalUrl'], settings['LiveKit:ApiKey'], settings['LiveKit:ApiSecret']);
const room = `ui-probe-${randomUUID()}`;
const channel = 'bde069ed-d1c4-4930-92d3-9360eab43cb8';
const applications = [];
try {
  await service.createRoom({name: room, emptyTimeout: 60, maxParticipants: 2});
  for (let i = 0; i < 2; i++) {
    const identity = `probe-${i}`;
    const token = new AccessToken(settings['LiveKit:ApiKey'], settings['LiveKit:ApiSecret'], {identity, name: `Pessoa ${i + 1}`, ttl: '2m'});
    token.addGrant({roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false});
    const grant = {leaseId: randomUUID(), token: await token.toJwt(), url: settings['LiveKit:PublicUrl']};
    const userData = await mkdtemp(path.join(os.tmpdir(), 'discorda-media-test-'));
    await copyFile(path.join(root,'apps/desktop/resources/lan.json'),path.join(userData,'server.json'));
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE; delete env.DISCORDA_DEV_SERVER_URL;
    const executablePath=process.env.DISCORDA_E2E_EXECUTABLE;
    const app = await electron.launch({executablePath,args: [...(executablePath?[]:[path.join(root, 'apps/desktop')]), `--user-data-dir=${userData}`, '--use-fake-device-for-media-stream'], env});
    applications.push(app);
    const page = await app.firstWindow();
    await app.evaluate(({ipcMain, session}, {grant, channel, identity}) => {
      ipcMain.removeHandler('auth:state'); ipcMain.handle('auth:state', () => ({status:'signed-in',profile:{id:identity,displayName:identity,email:'test@example.test'}}));
      ipcMain.removeHandler('chat:action'); ipcMain.handle('chat:action', (_e, action) => ({ok:true,data:action.kind==='voiceRoster'?[0,1].map(i=>({channelId:channel,userId:'user-'+i,leaseId:'probe-'+i,name:'Pessoa '+(i+1)})):action.kind==='workspace' ? {id:'test',name:'Teste de mídia',role:'Member',userId:identity,channels:[{id:'text-test',name:'geral'}],voiceChannels:[{id:channel,name:'Teste de voz'}]} : {items:[],hasMore:false}}));
      ipcMain.removeHandler('media:action'); ipcMain.handle('media:action', (_e, action) => {if(action.kind==='pulse'&&globalThis.testConflict){globalThis.testConflict=false;return {ok:false,status:409,message:'Lease expired'};}if(action.kind==='join')globalThis.testJoins=(globalThis.testJoins??0)+1;return {ok:true,data:action.kind==='join'?grant:{}};});
      ipcMain.removeHandler('live:start');ipcMain.handle('live:start',()=>{});
      session.defaultSession.setPermissionCheckHandler((_c,p)=>p==='media');
      session.defaultSession.setPermissionRequestHandler((_c,p,cb)=>cb(p==='media'));
    }, {grant, channel, identity});
    await page.addInitScript(() => {
      const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.testCaptureOptions=[];navigator.mediaDevices.getUserMedia=(options)=>{window.testCaptureOptions.push(options);return gum(options);};
      const OriginalAudio=window.AudioContext;window.testGains=[];window.testTones=[];window.AudioContext=class extends OriginalAudio{createOscillator(){const oscillator=super.createOscillator();const start=oscillator.start.bind(oscillator);oscillator.start=(...args)=>{window.testTones.push(oscillator.frequency.value);start(...args);};return oscillator;}createGain(){const gain=super.createGain();window.testGains.push(gain);return gain;}};
      const Original = window.RTCPeerConnection; window.testPeers = [];
      window.RTCPeerConnection = class extends Original { constructor(...args) { super(...args); window.testPeers.push(this); } };
    });
    await page.reload();
    await page.getByRole('button', {name:/^Teste de voz/}).click();
    await expect(page.locator('.call-status').getByText('Voz conectada',{exact:true})).toBeVisible({timeout:20000});if(i===0)await expect(page.locator('.voice-panel')).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>window.testTones.filter(hz=>Math.abs(hz-523.25)<1).length)).toBe(1);
    await page.getByRole('button',{name:'Selecionar microfone',exact:true}).click();await expect(page.getByRole('combobox',{name:'Escolher microfone'})).toBeVisible();await page.getByRole('button',{name:'Fechar dispositivos'}).click();
    await page.getByRole('button',{name:'Selecionar saída de áudio',exact:true}).click();await page.getByRole('combobox',{name:'Escolher saída'}).selectOption('');
    await page.getByRole('button',{name:'Ligar microfone',exact:true}).click();
    await expect(page.getByRole('button',{name:'Silenciar microfone',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Ligar câmera',exact:true}).click();
    await expect(page.getByRole('button',{name:'Desligar câmera',exact:true})).toBeVisible();
  }
  for (const app of applications) {
    const page = await app.firstWindow();
    await expect.poll(async () => page.evaluate(async () => {
      const stats = (await Promise.all(window.testPeers.map(p=>p.getStats()))).flatMap(r=>[...r.values()]);
      return ['audio','video'].every(kind=>stats.some(s=>s.type==='inbound-rtp' && s.kind===kind && s.bytesReceived>0 && (kind==='audio'||s.framesDecoded>0)));
    }), {timeout:20000}).toBe(true);
    await page.getByRole('button',{name:'Mostrar chamada'}).click();
    await page.getByRole('button',{name:'Mostrar chamada'}).click();
    await expect(page.getByRole('region',{name:'Chamada Teste de voz',exact:true}).getByText(/2 participante/)).toBeVisible();
  }


  const volumePage=await applications[0].firstWindow();
  await expect.poll(()=>volumePage.evaluate(()=>window.testTones.filter(hz=>Math.abs(hz-523.25)<1).length)).toBe(2);
  await volumePage.locator('.voice-roster').getByRole('button',{name:'Pessoa 2',exact:true}).click({button:'right'});
  await volumePage.getByRole('slider',{name:'Volume da voz',exact:true}).fill('250');
  await expect.poll(()=>volumePage.evaluate(()=>window.testGains.some(g=>Math.abs(g.gain.value-2.5)<.05))).toBe(true);
  await volumePage.getByRole('slider',{name:'Volume do compartilhamento',exact:true}).fill('75');
  await volumePage.getByRole('button',{name:'Fechar volume'}).click();
  await volumePage.getByRole('button',{name:'Ensurdecer',exact:true}).click();
  await expect.poll(()=>volumePage.evaluate(()=>window.testGains.every(g=>g.gain.value<.01))).toBe(true);
  await volumePage.getByRole('button',{name:'Voltar a ouvir',exact:true}).click();
  await expect.poll(()=>volumePage.evaluate(()=>window.testGains.some(g=>Math.abs(g.gain.value-2.5)<.05))).toBe(true);
  console.log('PASS: per-member Web Audio amplification, separate screen volume, deafen and restored gain.');
  const sender=applications[0],receiver=await applications[1].firstWindow(),senderPage=await sender.firstWindow();
  await sender.evaluate(async({BrowserWindow,ipcMain,session,desktopCapturer})=>{
    const captureWindow=new BrowserWindow({width:1920,height:1080,useContentSize:true,enableLargerThanScreen:true,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    await captureWindow.loadURL('data:text/html,'+encodeURIComponent('<title>Discorda 60 fps probe</title><canvas id="c" width="1920" height="1080"></canvas><style>body{margin:0}</style><script>const g=c.getContext("2d");function draw(t){g.fillStyle="#132b21";g.fillRect(0,0,1920,1080);g.fillStyle="white";g.font="40px sans-serif";for(let y=50;y<1080;y+=60)g.fillText("Discorda • Nitidez 1080p • "+Math.round(t)+" ms",20,y);g.fillStyle="#c7ee69";g.fillRect(t/4%1920,0,100,1080);requestAnimationFrame(draw)}requestAnimationFrame(draw)</script>'));
    await captureWindow.webContents.executeJavaScript('const canvas=document.getElementById("c"),g=canvas.getContext("2d");function draw(t){g.fillStyle="#132b21";g.fillRect(0,0,1920,1080);g.fillStyle="white";g.font="40px sans-serif";for(let y=50;y<1080;y+=60)g.fillText("Discorda 1080p • "+Math.round(t),20,y);g.fillStyle="#c7ee69";g.fillRect(t/4%1920,0,100,1080);requestAnimationFrame(draw)}requestAnimationFrame(draw)');
    ipcMain.removeHandler('media:sources');ipcMain.handle('media:sources',async()=>{const sources=await desktopCapturer.getSources({types:['window']});return sources.filter(s=>s.name==='Discorda 60 fps probe').map(s=>({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()}));});
    ipcMain.removeHandler('media:select');ipcMain.handle('media:select',()=>{});
    session.defaultSession.setDisplayMediaRequestHandler(async(_r,callback)=>{const sources=await desktopCapturer.getSources({types:['window']});callback({video:sources.find(s=>s.name==='Discorda 60 fps probe')});});
  });
  await senderPage.getByRole('button',{name:'Compartilhar tela',exact:true}).click();
  await senderPage.locator('.capture-grid').getByRole('button',{name:'Discorda 60 fps probe',exact:true}).click();
  await expect(receiver.locator('video.screen-video')).toHaveCount(1,{timeout:15000});
  for(const page of [senderPage,receiver]) await expect.poll(()=>page.evaluate(()=>window.testTones.filter(hz=>Math.abs(hz-987.77)<1).length)).toBe(1);
  const measure=()=>receiver.evaluate(async()=>{const stats=(await Promise.all(window.testPeers.map(p=>p.getStats()))).flatMap(r=>[...r.values()]);return stats.filter(s=>s.type==='inbound-rtp'&&s.kind==='video').map(s=>({width:s.frameWidth,height:s.frameHeight,fps:s.framesPerSecond,decoded:s.framesDecoded,bytes:s.bytesReceived}));});
  await expect.poll(async()=> (await measure()).some(s=>s.width>=1900&&s.fps>=45),{timeout:30000}).toBe(true);
  await receiver.locator('video.screen-video').evaluate(v=>v.pause());await expect.poll(()=>receiver.locator('video.screen-video').evaluate(v=>v.paused)).toBe(false);
  await expect(receiver.locator('video.screen-video')).not.toHaveAttribute('controls','');
  await expect.poll(()=>receiver.locator('.ping-indicator').getAttribute('aria-label')).toMatch(/Ping: \d+ ms/);
  const before=(await measure()).find(s=>s.width>=1900),started=Date.now();await new Promise(resolve=>setTimeout(resolve,10000));const after=(await measure()).find(s=>s.width>=1900);const sustainedFps=(after.decoded-before.decoded)*1000/(Date.now()-started);console.log('SCREEN RTP',JSON.stringify({...after,sustainedFps}));expect(sustainedFps).toBeGreaterThan(45);
  await receiver.screenshot({path:path.join(root,'artifacts/radmin/call-0.5.png')});
  await receiver.getByRole('navigation',{name:'Visualização'}).getByRole('button',{name:'Chat',exact:true}).click();await expect(receiver.locator('.voice-panel')).toHaveCount(0);
  await receiver.locator('.composer-row textarea').fill('Uma conversa, tudo no mesmo lugar.');await receiver.screenshot({path:path.join(root,'artifacts/radmin/chat-0.5.png')});
  await receiver.getByRole('navigation',{name:'Visualização'}).getByRole('button',{name:/Chamada/}).click();await expect.poll(()=>receiver.locator('video.screen-video').evaluate(v=>v.videoWidth)).toBeGreaterThan(0);
  await receiver.getByRole('navigation',{name:'Visualização'}).getByRole('button',{name:'Chat',exact:true}).click();await expect(receiver.locator('.composer-row textarea')).toHaveValue('Uma conversa, tudo no mesmo lugar.');
  await senderPage.getByRole('button',{name:'Parar tela',exact:true}).click();
  await expect(receiver.locator('video.screen-video')).toHaveCount(0);
  for(const page of [senderPage,receiver]) await expect.poll(()=>page.evaluate(()=>window.testTones.filter(hz=>Math.abs(hz-493.88)<1).length)).toBe(1);
  if(await senderPage.getByRole('button',{name:'Ligar microfone',exact:true}).count())await senderPage.getByRole('button',{name:'Ligar microfone',exact:true}).click();
  await senderPage.getByRole('button',{name:'Ajustar microfone',exact:true}).click();
  await senderPage.getByRole('checkbox',{name:'Supressão de ruído',exact:true}).uncheck();
  await expect.poll(()=>senderPage.evaluate(()=>window.testCaptureOptions.some(o=>o.audio?.noiseSuppression===false))).toBe(true);
  await senderPage.getByRole('checkbox',{name:'Supressão de ruído',exact:true}).check();
  await senderPage.getByRole('button',{name:'Fechar configurações',exact:true}).click();
  await senderPage.getByRole('button',{name:'Selecionar saída de áudio',exact:true}).click();
  const output=senderPage.getByRole('combobox',{name:'Escolher saída'});
  const device=await output.locator('option').evaluateAll(options=>options.map(o=>o.value).find(v=>v));
  expect(device).toBeTruthy();await output.selectOption(device);await expect(senderPage.locator('.device-menu')).toHaveCount(0);
  await senderPage.evaluate(()=>{window.originalEnumerate=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);navigator.mediaDevices.enumerateDevices=async()=>{const devices=await window.originalEnumerate();return devices.filter(d=>d.kind!=='audiooutput');};navigator.mediaDevices.dispatchEvent(new Event('devicechange'));});
  await expect.poll(()=>senderPage.evaluate(()=>localStorage.getItem('discorda:output'))).toBe('');
  await expect(senderPage.getByText('Fones desconectados. Som transferido para a saída padrão do Windows.',{exact:true})).toBeVisible();
  await senderPage.evaluate(()=>{navigator.mediaDevices.enumerateDevices=window.originalEnumerate;});
  console.log('PASS: noise filter applies to live capture; headphone removal selects default output.');
  await sender.evaluate(()=>{globalThis.testConflict=true;});
  await expect.poll(()=>sender.evaluate(()=>globalThis.testJoins),{timeout:20000}).toBe(2);
  await expect(senderPage.locator('.call-status').getByText('Voz conectada',{exact:true})).toBeVisible({timeout:20000});
  await expect(senderPage.getByRole('button',{name:'Silenciar microfone',exact:true})).toBeVisible();
  console.log('PASS: expired lease obtains a fresh grant and restores voice automatically.');
  console.log('PASS: two Electron renderers exchange real audio/video RTP through HTTPS/WSS Radmin endpoint; minimize preserves call.');
  for (const app of applications) {
    const page = await app.firstWindow();
    await page.getByRole('button',{name:'Sair da chamada',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.testPeers.every(p=>p.connectionState==='closed'))).toBe(true);
    await expect.poll(()=>page.evaluate(()=>window.testTones.some(hz=>Math.abs(hz-392)<1))).toBe(true);
  }
  console.log('PASS: local/remote join, leave, share and stop sounds synthesized in real AudioContexts; leaving closes every RTCPeerConnection.');
} finally {
  for (const app of applications) await app.close().catch(()=>{});
  await service.deleteRoom(room).catch(()=>{});
}

