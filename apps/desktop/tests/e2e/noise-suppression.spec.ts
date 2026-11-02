import {chromium,expect,test} from '@playwright/test';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';

test('neural suppression reduces continuous noise, retains speech and falls back without losing audio',async()=>{
 test.setTimeout(90000);
 const server=await createServer({cacheDir:'node_modules/.vite-e2e-denoise',optimizeDeps:{entries:['index.html']},server:{port:5193,strictPort:true}});await server.listen();
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:5193');
  const run=async(fallback=false)=>page.evaluate(async({speech,fallback})=>{
   const path='/src/renderer/features/chat/microphone.ts';const {MicrophoneProcessor}=await import(path);
   const context=new AudioContext({sampleRate:48000}),input=context.createMediaStreamDestination(),analyser=context.createAnalyser(),raw=context.createAnalyser();analyser.fftSize=4096;raw.fftSize=4096;
   if(fallback){const add=context.audioWorklet.addModule.bind(context.audioWorklet);context.audioWorklet.addModule=(url,options)=>String(url).includes('rnnoise-worklet')?Promise.reject(Error('Simulated model load failure')):add(url,options);}
   const noise=context.createBufferSource(),buffer=context.createBuffer(1,48000*8,48000),values=buffer.getChannelData(0);let seed=7;
   for(let i=0;i<values.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;values[i]=((seed/4294967296)*2-1)*.025;}
   noise.buffer=buffer;noise.connect(input);noise.connect(raw);
   const voice=context.createBufferSource();voice.buffer=await context.decodeAudioData(Uint8Array.from(atob(speech),c=>c.charCodeAt(0)).buffer);voice.connect(input);
   const processor=new MicrophoneProcessor({gain:1,gate:false,threshold:-50,deviceId:'',noiseMode:'neural'});
   // A WebAudio destination is not a capture device and cannot implement AEC/NS
   // constraints. Acknowledge those here so this test isolates the actual DSP.
   input.stream.getAudioTracks()[0].applyConstraints=async()=>{};
   const rms=(node:AnalyserNode)=>{const samples=new Float32Array(4096);node.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);};
   try{
    await processor.init({audioContext:context,track:input.stream.getAudioTracks()[0],kind:'audio'});
    const output=context.createMediaStreamSource(new MediaStream([processor.processedTrack!]));output.connect(analyser);noise.start();
    await new Promise(r=>setTimeout(r,3000));const before=rms(raw),after=rms(analyser),mode=processor.processing;
    voice.start();await new Promise(r=>setTimeout(r,1800));let speechPeak=0;for(let i=0;i<10;i++){speechPeak=Math.max(speechPeak,rms(analyser));await new Promise(r=>setTimeout(r,100));}
    processor.configure({...processor.settings,noiseSuppression:false});await new Promise(r=>setTimeout(r,300));const off=processor.processing;
    return {before,after,speechPeak,mode,off,warning:processor.processingWarning,fallback};
   }finally{await processor.destroy();noise.stop();voice.stop();input.stream.getTracks().forEach(t=>t.stop());await context.close();}
  },{speech:readFileSync(new URL('../fixtures/speech.wav',import.meta.url)).toString('base64'),fallback});
  const neural=await run();console.log(JSON.stringify({neural}));expect(neural.mode).toBe('neural');expect(neural.before).toBeGreaterThan(.005);expect(neural.after).toBeLessThan(neural.before*.5);expect(neural.speechPeak).toBeGreaterThan(.005);expect(neural.off).toBe('off');
  await page.reload();const fallback=await run(true);expect(fallback.mode).toBe('standard');expect(fallback.after).toBeGreaterThan(.003);expect(fallback.speechPeak).toBeGreaterThan(.005);
  console.log(JSON.stringify({noiseReductionDb:20*Math.log10(neural.before/neural.after),speechPeak:neural.speechPeak,fallback:fallback.mode}));
 }finally{await browser.close();await server.close();}
});
