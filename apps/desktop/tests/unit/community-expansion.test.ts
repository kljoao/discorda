import {describe,it,expect,vi} from 'vitest';
vi.mock('electron',()=>({app:{},globalShortcut:{register:vi.fn(()=>true),unregister:vi.fn()},dialog:{},nativeImage:{},shell:{}}));
import {Shortcuts,validateShortcuts,validAccelerator} from '../../src/main/shortcuts';
import {globalShortcut} from 'electron';
import {validateChatAction} from '../../src/main/chat';
import {safeRaster} from '../../src/main/image-bounds';
import {comparePeople} from '../../src/renderer/features/chat/voice-order';
import {diagnosticSummary} from '../../src/renderer/features/chat/diagnostic-summary';
describe('community feature boundaries',()=>{
 it('unregisters previous shortcuts even if a new configuration is invalid',()=>{
  const manager=new Shortcuts(()=>{});manager.configure({enabled:true,pushToTalk:false,mute:'Control+Shift+M',talk:'F9',deafen:'Control+Shift+D',cinema:'Control+Shift+F'});
  expect(()=>manager.configure({enabled:false,pushToTalk:false,mute:'broken',talk:'F9'})).toThrow();
  expect(globalShortcut.unregister).toHaveBeenCalledWith('Control+Shift+M');expect(globalShortcut.unregister).toHaveBeenCalledWith('Control+Shift+D');expect(globalShortcut.unregister).toHaveBeenCalledWith('Control+Shift+F');
 });
 it('accepts modifier shortcuts and rejects ambiguous conflicts',()=>{
  for(const key of ['Control+Alt+Shift+P','Control+Shift+F','Alt+7','F12'])expect(validAccelerator(key)).toBe(true);
  for(const key of ['A','Shift+A','Control+Control+A','Super+Delete','F99','Control+Space'])expect(validAccelerator(key)).toBe(false);
  expect(()=>validateShortcuts({enabled:true,pushToTalk:false,mute:'F9',talk:'F9',deafen:'Control+Shift+D'})).not.toThrow();
  expect(()=>validateShortcuts({enabled:true,pushToTalk:true,mute:'F9',talk:'F9'})).toThrow();
  expect(()=>validateShortcuts({enabled:true,pushToTalk:false,mute:'F9',talk:'F10',cinema:'F9'})).toThrow();
 });
 it('sorts ties deterministically independent of speaking/arrival order',()=>{
  const people=[['zoe','1'],['ana','3'],['Ána','2'],['Bruno','4']];
  expect(people.sort((a,b)=>comparePeople(a[0],a[1],b[0],b[1])).map(p=>p[1])).toEqual(['2','3','4','1']);
 });
 it('rejects huge dimensions and non raster previews before decoding',()=>{
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(1920,16);png.writeUInt32BE(1080,20);
  expect(safeRaster(png)).toBe(true);png.writeUInt32BE(100000,16);expect(safeRaster(png)).toBe(false);
  expect(safeRaster(Buffer.from('<svg>'))).toBe(false);expect(safeRaster(Buffer.from([255,216,255,192,255,255]))).toBe(false);
 });
 it('does not expose unknown fields in shared diagnostic text',()=>{
  const report={version:'1.2.3',platform:'win32',api:'online',database:'ready',chat:'connected',callActive:true,email:'private@example.test',token:'secret',ip:'1.2.3.4'} as any;
  const text=diagnosticSummary(report);expect(text).toContain('1.2.3');for(const secret of ['private@example.test','secret','1.2.3.4'])expect(text).not.toContain(secret);
 });
 it('validates thread IDs and never accepts renderer supplied file paths',()=>{
  const channelId='225a47d7-779e-4992-89d2-03b1517f9112';
  expect(()=>validateChatAction({kind:'history',channelId,thread:'1'})).not.toThrow();
  expect(()=>validateChatAction({kind:'history',channelId,thread:'../admin'})).toThrow();
  expect(()=>validateChatAction({kind:'attachmentGet',channelId,id:'C:/secret'})).toThrow();
 });
});
