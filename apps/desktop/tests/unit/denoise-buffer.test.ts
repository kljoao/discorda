import {it,expect} from 'vitest';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
it('bridges 128-sample render blocks and 480-sample model frames without losing order, then releases state',async()=>{
 let Processor:any,destroyed=0;
 const source=readFileSync(new URL('../../src/renderer/features/chat/rnnoise-worklet.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
 vm.runInNewContext(source,{Rnnoise:{load:async()=>({frameSize:480,createDenoiseState:()=>({processFrame:(frame:Float32Array)=>{for(let i=0;i<frame.length;i++)frame[i]*=.5;},destroy:()=>{destroyed++;}})})},AudioWorkletProcessor:class{port={onmessage:null,postMessage:()=>{}}},registerProcessor:(_name:string,value:unknown)=>{Processor=value;}});
 const processor=new Processor();await Promise.resolve();await Promise.resolve();
 const input=Float32Array.from({length:128*100},(_,i)=>Math.sin(i/30)*.1),rendered=new Float32Array(input.length);
 for(let offset=0;offset<input.length;offset+=128){const output=new Float32Array(128);processor.process([[input.subarray(offset,offset+128)]],[[output]]);rendered.set(output,offset);expect(processor.available).toBeLessThan(processor.queue.length);}
 for(let i=0;i<480;i++)expect(rendered[i]).toBe(0);
 for(let i=480;i<input.length;i++)expect(rendered[i]).toBeCloseTo(input[i-480]*.5,6);
 processor.port.onmessage({data:'destroy'});expect(destroyed).toBe(1);expect(processor.process([],[[new Float32Array(128)]])).toBe(false);
});
