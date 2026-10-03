import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
vi.mock('electron',()=>({shell:{},app:{},globalShortcut:{}}));
import {validateChatAction} from '../../src/main/chat';
import {validateShortcuts} from '../../src/main/shortcuts';
import {compareVersions} from '../../src/main/update-verification';
import {videoHealth} from '../../src/renderer/features/chat/media-quality';
import {screenOptions} from '../../src/renderer/features/chat/screen-quality';
import {mergeMessages} from '../../src/renderer/features/chat/Chat';
import type {ChatMessage} from '../../src/shared/ipc/contracts';

describe('community security boundaries',()=>{
 it('rejects unbounded batches, invalid IDs, role escalation payloads and executable shortcuts',()=>{
  const channelId='225a47d7-779e-4992-89d2-03b1517f9112';
  for(const action of [{kind:'annotations',channelId,ids:Array(101).fill('1')},{kind:'read',channelId,id:'9223372036854775808'},{kind:'role',userId:channelId,role:'Owner'},{kind:'search',channelId,query:'x'.repeat(121)},{kind:'reaction',channelId,id:'1',emoji:'<img>',enabled:true}])expect(()=>validateChatAction(action)).toThrow();
  expect(()=>validateShortcuts({enabled:true,pushToTalk:true,mute:'exec bad',talk:'F9'})).toThrow();
  expect(()=>validateShortcuts({enabled:true,pushToTalk:true,mute:'F9',talk:'F9'})).toThrow();
  expect(()=>validateShortcuts({enabled:true,pushToTalk:true,mute:'Control+Shift+M',talk:'F9'})).not.toThrow();
 });
 it('orders beta and stable releases without enabling downgrades',()=>{
  expect(compareVersions('1.0.0','1.0.0-beta.2')).toBe(1);expect(compareVersions('1.0.0-beta.2','1.0.0-beta.1')).toBe(1);
  expect(compareVersions('1.0.0-beta.1','1.0.0')).toBe(-1);expect(compareVersions('0.9.0','1.0.0-beta.1')).toBe(-1);
  expect(()=>compareVersions('1.0.0-../../bad','0.9.0')).toThrow();
 });
 it('keeps push-to-talk silent on missing or expired heartbeats',()=>{
  let Processor:any;const context=vm.createContext({sampleRate:48000,currentTime:0,AudioWorkletProcessor:class{port={onmessage:undefined as any,postMessage(){}};},registerProcessor:(_name:string,p:any)=>{Processor=p;}});
  vm.runInContext(readFileSync('src/renderer/features/chat/microphone-worklet.js','utf8'),context);
  const processor=new Processor();processor.port.onmessage({data:{gain:1,gate:true,threshold:-10,pushToTalk:true}});
  // Quiet speech must pass while holding the key, even below the voice threshold.
  const input=[[new Float32Array(128).fill(0.01)]],output=[[new Float32Array(128)]];
  processor.process(input,output);expect(output[0][0].every(v=>v===0)).toBe(true);
  processor.port.onmessage({data:{talk:true}});processor.process(input,output);expect(output[0][0].some(v=>v>0)).toBe(true);
  context.currentTime=1;for(let i=0;i<150;i++)processor.process(input,output);expect(Math.max(...output[0][0])).toBeLessThan(0.00001);
 });
});
it('preserves ordered history, newer edits and 64-bit IDs across repeated merges',()=>{
 const message=(id:string,version=1)=>({id,version} as ChatMessage);
 const original=Array.from({length:10000},(_,i)=>message(String(BigInt(i)+9007199254740993n)));
 const incoming=[message(original[9999].id,2),message('9007199254750993'),message(original[0].id,0)];
 const merged=mergeMessages(original,incoming);expect(merged).toHaveLength(10001);expect(merged[0].version).toBe(1);expect(merged[9999].version).toBe(2);expect(mergeMessages(merged,incoming)).toEqual(merged);
});
it('uses interval counters and reports limits without inventing a network diagnosis',()=>{
 const previous={timestamp:1000,bytes:0,received:100,lost:10,dropped:0,frames:30,jitter:0};
 const current={...previous,timestamp:3000,bytes:1000000,received:200,lost:10,frames:150};
 expect(videoHealth(current,previous)).toMatchObject({mbps:4,loss:0,drop:0});expect(videoHealth({...current,bytes:-1},previous)).toBeUndefined();
 expect(videoHealth({...current,lost:30},previous)?.hint).toContain('Perda');
 expect(screenOptions('auto',60,'games').publish.degradationPreference).toBe('maintain-framerate');
 expect(screenOptions('auto',30,'text').capture.contentHint).toBe('detail');
});
