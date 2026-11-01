import {EventEmitter} from 'node:events';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {BrowserWindow} from 'electron';
const mocks=vi.hoisted(()=>({spawn:vi.fn()}));
vi.mock('electron',()=>({app:{isPackaged:false,getAppPath:()=>'/fixture'}}));
vi.mock('node:child_process',()=>({execFile:vi.fn(),spawn:mocks.spawn}));
import {ApplicationAudio} from '../../src/main/application-audio';
import {IPC} from '../../src/shared/ipc/contracts';

function child(){
  const result=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),stdin:Object.assign(new EventEmitter(),{end:vi.fn(()=>queueMicrotask(()=>{result.emit('exit',0);result.emit('close',0);}))}),kill:vi.fn()});
  queueMicrotask(()=>result.stderr.emit('data',Buffer.from('READY')));
  return result;
}
beforeEach(()=>mocks.spawn.mockReset());
describe('native audio lifecycle',()=>{
  it('does not deliver an old capture end notification to its replacement',async()=>{
    const send=vi.fn(),window={isDestroyed:()=>false,webContents:{send}} as unknown as BrowserWindow;
    mocks.spawn.mockImplementation(child);
    const audio=new ApplicationAudio(()=>window,()=>true);
    await audio.start('system');await audio.start('system');
    expect(send.mock.calls.filter(([event])=>event===IPC.applicationAudioEnd)).toHaveLength(0);
    audio.stop();expect(send).toHaveBeenCalledWith(IPC.applicationAudioEnd);
  });
  it('forwards complete stereo PCM packets without discarding a partial pipe read',async()=>{
    const send=vi.fn(),window={isDestroyed:()=>false,webContents:{send}} as unknown as BrowserWindow;
    mocks.spawn.mockImplementation(child);
    const audio=new ApplicationAudio(()=>window,()=>true);await audio.start('system');
    const process=mocks.spawn.mock.results[0].value;
    const packet=Buffer.alloc(7680);for(let offset=0;offset<packet.length;offset+=4)packet.writeFloatLE(.125,offset);
    process.stdout.emit('data',packet.subarray(0,3000));expect(send).not.toHaveBeenCalled();
    process.stdout.emit('data',packet.subarray(3000));
    expect(send).toHaveBeenCalledWith(IPC.applicationAudioData,new Uint8Array(packet));audio.stop();
  });
});
