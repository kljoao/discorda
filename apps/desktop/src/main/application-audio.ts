import { app, type BrowserWindow } from 'electron';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { IPC, type AudioApplication } from '../shared/ipc/contracts';

const run = promisify(execFile);
export class ApplicationAudio {
  private apps = new Set<string>();
  private child?: ChildProcessWithoutNullStreams;
  private epoch = 0;
  private heartbeat = 0;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private window:()=>BrowserWindow|null, private authorized:()=>boolean) {}
  private executable() { return path.join(app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(),'resources'),'windows-audio','Discorda.Audio.exe'); }
  async status():Promise<{supported:boolean;os:string}>{const {stdout}=await run(this.executable(),["status"],{windowsHide:true,timeout:15000});return JSON.parse(stdout);}
  async list(): Promise<AudioApplication[]> {
    if(!this.authorized())throw new Error('Entre em um canal de voz.');
    const {stdout} = await run(this.executable(),['list'],{windowsHide:true,timeout:5000,maxBuffer:1024*1024});
    const apps = JSON.parse(stdout) as AudioApplication[];
    this.apps = new Set(apps.map(p=>p.id));return apps;
  }
  async start(id:unknown):Promise<void> {
    if(!this.authorized() || typeof id!=='string' || (id!=='system' && id!=='system-no-browser' && (!this.apps.has(id) || !/^\d+:\d+$/.test(id))))throw new Error('Selecione um aplicativo de áudio válido.');
    this.stop();const epoch=this.epoch;
    const child=spawn(this.executable(),id==='system'||id==='system-no-browser'?['system',String(process.pid),...(id==='system-no-browser'?['no-browsers']:[])]:['capture',id],{windowsHide:true,stdio:'pipe'});this.child=child;child.stdin.on('error',()=>{});this.heartbeat=Date.now()+15000;
    let pending=Buffer.alloc(0);
    child.stdout.on('data',(chunk:Buffer)=>{
      if(this.child!==child)return;
      pending=Buffer.concat([pending,chunk]);
      // 20 ms stereo float PCM. Bounded tail, no audio written to disk or logs.
      while(pending.length>=7680){const packet=pending.subarray(0,7680);pending=pending.subarray(7680);const window=this.window();if(window&&!window.isDestroyed())window.webContents.send(IPC.applicationAudioData,new Uint8Array(packet));}
    });
    child.on('close',()=>{if(this.child===child){this.child=undefined;if(this.timer)clearInterval(this.timer);this.timer=undefined;this.notifyEnd();}});
    this.timer=setInterval(()=>{if(!this.authorized()||Date.now()-this.heartbeat>7000)this.stop();},1000);
    try { await new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('A captura de áudio não respondeu.')),15000);
      const done=(error?:Error)=>{clearTimeout(timeout);child.removeListener('error',failed);child.removeListener('exit',exited);error?reject(error):resolve();};
      const failed=()=>done(new Error('Não foi possível iniciar a captura por aplicativo.'));
      const exited=()=>done(new Error('Captura indisponível. Requer Windows 11 ou Windows build 20348+.'));
      child.once('error',failed);child.once('exit',exited);child.stderr.on('data',(buffer:Buffer)=>{if(buffer.toString().includes('READY'))done();});
    }); if(epoch!==this.epoch)throw new Error('Captura cancelada.');this.heartbeat=Date.now(); }
    catch(error){if(this.child===child)this.stop();throw error;}
  }
  private notifyEnd(){const window=this.window();if(window&&!window.isDestroyed())window.webContents.send(IPC.applicationAudioEnd);}
  pulse(){if(this.child)this.heartbeat=Date.now();}
  stop(){this.epoch++;const child=this.child;this.child=undefined;if(this.timer)clearInterval(this.timer);this.timer=undefined;
    if(child){this.notifyEnd();child.stdin.end('\n');const timer=setTimeout(()=>child.kill(),3000);timer.unref();child.once('exit',()=>clearTimeout(timer));}}
}
