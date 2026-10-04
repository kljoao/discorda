import {it,expect,vi,beforeEach} from 'vitest';
const f=vi.hoisted(()=>({files:new Map<string,string>(),version:'1.0.0',available:true,events:new Map<string,Function>(),install:vi.fn(),download:vi.fn()}));
vi.mock('electron',()=>({app:{isPackaged:true,getVersion:()=>f.version,getPath:()=>'/test'}}));
vi.mock('node:fs',()=>({readFileSync:(path:string)=>{if(!f.files.has(path))throw Error();return f.files.get(path);},writeFileSync:(path:string,value:string)=>f.files.set(path,value),unlinkSync:(path:string)=>f.files.delete(path)}));
vi.mock('electron-updater',()=>({NsisUpdater:class{},autoUpdater:{on:(name:string,callback:Function)=>f.events.set(name,callback),checkForUpdates:async()=>({isUpdateAvailable:f.available,updateInfo:{version:'1.1.0'}}),downloadUpdate:()=>f.download(),quitAndInstall:()=>f.install()}}));
vi.mock('../../src/main/update-verification',async(importOriginal)=>({...await importOriginal<typeof import('../../src/main/update-verification')>(),releaseVersion:/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/,verifyRelease:()=>({version:'1.1.0',compatibility:{protocolMin:1,protocolMax:1,signature:'test'}}),verifyInstaller:async()=>{}}));
import {Updates} from '../../src/main/updates';
beforeEach(()=>{f.available=true;f.files.clear();f.events.clear();f.install.mockClear();f.version='1.0.0';vi.stubEnv('DISCORDA_OFFICIAL_RELEASE','1');vi.stubGlobal('fetch',async()=>new Response('{}'));f.download.mockImplementation(async()=>{f.events.get('update-downloaded')?.({downloadedFile:'installer.exe'});});});
it('blocks installation in a call and confirms the new renderer startup',async()=>{
 let call=false;const update=new Updates(()=>call,async()=>1);await update.check();await vi.waitFor(()=>expect(update.state.status).toBe('ready'));
 call=true;await expect(update.install()).rejects.toThrow('Saia da chamada');expect(f.install).not.toHaveBeenCalled();expect(f.files.size).toBe(0);
 call=false;await update.install();expect(f.install).toHaveBeenCalledOnce();expect(f.files.size).toBe(1);
 f.version='1.1.0';const next=new Updates(()=>false,async()=>1);next.confirmStartup();expect(next.snapshot().startupNotice).toContain('abertura confirmada');expect(f.files.size).toBe(0);
});
it('reports when an attempted update reopens the old version',async()=>{
 const update=new Updates(()=>false,async()=>1);await update.check();await vi.waitFor(()=>expect(update.state.status).toBe('ready'));await update.install();const next=new Updates(()=>false,async()=>1);next.confirmStartup();expect(next.snapshot().startupNotice).toContain('não foi concluída');
});

it('does not download when the feed has no newer release',async()=>{f.available=false;f.download.mockClear();const update=new Updates(()=>false,async()=>1);await update.check();expect(update.state.status).toBe('current');expect(f.download).not.toHaveBeenCalled();});

it('blocks incompatible or unknown server protocols before launching the installer',async()=>{let protocol:number|undefined=2;const update=new Updates(()=>false,async()=>protocol);await update.check();await vi.waitFor(()=>expect(update.state.status).toBe('ready'));await expect(update.install()).rejects.toThrow('não é compatível');expect(f.install).not.toHaveBeenCalled();protocol=undefined;await expect(update.install()).rejects.toThrow('confirmar');expect(f.install).not.toHaveBeenCalled();protocol=1;await update.install();expect(f.install).toHaveBeenCalledOnce();});
