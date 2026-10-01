import {it,expect,vi,beforeEach} from 'vitest';
const f=vi.hoisted(()=>({files:new Map<string,string>(),version:'1.0.0',available:true,events:new Map<string,Function>(),install:vi.fn(),download:vi.fn()}));
vi.mock('electron',()=>({app:{isPackaged:true,getVersion:()=>f.version,getPath:()=>'/test'}}));
vi.mock('node:fs',()=>({readFileSync:(path:string)=>{if(!f.files.has(path))throw Error();return f.files.get(path);},writeFileSync:(path:string,value:string)=>f.files.set(path,value),unlinkSync:(path:string)=>f.files.delete(path)}));
vi.mock('electron-updater',()=>({NsisUpdater:class{},autoUpdater:{on:(name:string,callback:Function)=>f.events.set(name,callback),checkForUpdates:async()=>({isUpdateAvailable:f.available,updateInfo:{version:'1.1.0'}}),downloadUpdate:()=>f.download(),quitAndInstall:()=>f.install()}}));
vi.mock('../../src/main/update-verification',()=>({verifyRelease:()=>({version:'1.1.0'}),verifyInstaller:async()=>{}}));
import {Updates} from '../../src/main/updates';
beforeEach(()=>{f.available=true;f.files.clear();f.events.clear();f.install.mockClear();f.version='1.0.0';vi.stubEnv('DISCORDA_OFFICIAL_RELEASE','1');vi.stubGlobal('fetch',async()=>new Response('{}'));f.download.mockImplementation(async()=>{f.events.get('update-downloaded')?.({downloadedFile:'installer.exe'});});});
it('blocks installation in a call and confirms the new renderer startup',async()=>{
 let call=false;const update=new Updates(()=>call);await update.check();await vi.waitFor(()=>expect(update.state.status).toBe('ready'));
 call=true;await expect(update.install()).rejects.toThrow('Saia da chamada');expect(f.install).not.toHaveBeenCalled();expect(f.files.size).toBe(0);
 call=false;await update.install();expect(f.install).toHaveBeenCalledOnce();expect(f.files.size).toBe(1);
 f.version='1.1.0';const next=new Updates(()=>false);next.confirmStartup();expect(next.snapshot().startupNotice).toContain('abertura confirmada');expect(f.files.size).toBe(0);
});
it('reports when an attempted update reopens the old version',async()=>{
 const update=new Updates(()=>false);await update.check();await vi.waitFor(()=>expect(update.state.status).toBe('ready'));await update.install();const next=new Updates(()=>false);next.confirmStartup();expect(next.snapshot().startupNotice).toContain('não foi concluída');
});

it('does not download when the feed has no newer release',async()=>{f.available=false;f.download.mockClear();const update=new Updates(()=>false);await update.check();expect(update.state.status).toBe('current');expect(f.download).not.toHaveBeenCalled();});
