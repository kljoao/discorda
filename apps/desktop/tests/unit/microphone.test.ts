import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

it('audio gate suppresses quiet input, applies gain, holds speech briefly and releases', () => {
  let Processor: new()=>{settings:{gain:number;threshold:number;gate:boolean};process:(i:Float32Array[][],o:Float32Array[][])=>void};
  vm.runInNewContext(readFileSync(new URL('../../src/renderer/features/chat/microphone-worklet.js',import.meta.url),'utf8'), {
    AudioWorkletProcessor:class{port={onmessage:null,postMessage:()=>{}}},sampleRate:48000,
    registerProcessor:(_name:string, ctor:typeof Processor)=>{Processor=ctor;},
  });
  const gate=new Processor!();
  const render=(amplitude:number, blocks=1)=>{const output=new Float32Array(128);for(let i=0;i<blocks;i++)gate.process([[new Float32Array(128).fill(amplitude)]],[[output]]);return Math.max(...output);};
  expect(render(0.0001,100)).toBe(0);
  expect(render(0.2,100)).toBeCloseTo(0.2,3);
  expect(render(0.0001)).toBeGreaterThan(0);
  expect(render(0.0001,300)).toBeLessThan(0.000001);
  gate.settings={gain:2,threshold:-10,gate:false};
  expect(render(0.1,100)).toBeCloseTo(0.2,3);
  expect(render(0.9,100)).toBeLessThanOrEqual(1);
});
