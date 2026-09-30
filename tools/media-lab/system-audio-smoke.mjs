import {chromium} from '@playwright/test';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const helper=path.resolve('apps/desktop/resources/windows-audio/Discorda.Audio.exe');
const contexts=[];let child;
try {
for(const [title,hz] of [['Discorda selected audio probe',440],['Discorda excluded audio probe',1100]]){
 const context=await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(),'discorda-audio-probe-')),{channel:'msedge',headless:false,args:['--autoplay-policy=no-user-gesture-required']});contexts.push(context);
 const page=context.pages()[0];await page.setContent('<title>'+title+'</title><h1>'+title+'</h1>');
 await page.evaluate(hz=>{const context=new AudioContext({sampleRate:48000});const osc=context.createOscillator(),gain=context.createGain();osc.frequency.value=hz;gain.gain.value=.02;osc.connect(gain).connect(context.destination);osc.start();window.probeContext=context;return context.resume();},hz);
}
let apps=[];for(let attempt=0;attempt<20;attempt++){const {stdout}=await promisify(execFile)(helper,['list']);apps=JSON.parse(stdout);if(apps.some(a=>a.title.includes('excluded audio probe')))break;await new Promise(r=>setTimeout(r,100));}const selected=apps.find(a=>a.title.includes('selected audio probe'));assert(selected,'Selected test browser appears in native list');assert(!apps.some(a=>/^discord|^electron$/i.test(a.name)));
const excludedApp=apps.find(a=>a.title.includes('excluded audio probe'));assert(excludedApp);
child=spawn(helper,['system',excludedApp.id.split(':')[0]],{stdio:'pipe',windowsHide:true});let chunks=[];child.stdout.on('data',d=>chunks.push(d));let stderr='';child.stderr.on('data',d=>stderr+=d);
await new Promise(r=>setTimeout(r,1200));
const late=await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(),'discorda-late-audio-')),{channel:'msedge',headless:false,args:['--autoplay-policy=no-user-gesture-required']});contexts.push(late);
await late.pages()[0].setContent('<title>Late application audio probe</title>');
await late.pages()[0].evaluate(()=>{const c=new AudioContext(),o=c.createOscillator(),g=c.createGain();g.gain.value=.02;o.frequency.value=660;o.connect(g).connect(c.destination);o.start();window.probeContext=c;return c.resume();});
await new Promise(r=>setTimeout(r,5000));child.stdin.end('\n');await new Promise(r=>child.once('exit',r));
assert(stderr.includes('READY'),stderr);
const bytes=Buffer.concat(chunks);assert(bytes.length>48000*8,'At least one second of stereo audio');
const samples=new Float32Array(bytes.buffer,bytes.byteOffset,Math.floor(bytes.length/4));
function amplitude(hz){let re=0,im=0;const frames=Math.min(48000,samples.length/2);const start=Math.max(0,Math.floor(samples.length/2)-frames);for(let n=0;n<frames;n++){const value=samples[(start+n)*2];const phase=2*Math.PI*hz*n/48000;re+=value*Math.cos(phase);im+=value*Math.sin(phase);}return Math.hypot(re,im)/frames*2;}
const wanted=amplitude(440),second=amplitude(660),excluded=amplitude(1100);
console.log(JSON.stringify({frames:samples.length/2,selectedTone:wanted,secondTone:second,excludedTone:excluded,isolationDb:20*Math.log10(wanted/Math.max(excluded,1e-12))}));
assert(second>.0001,'Second application mixed automatically');assert(wanted>.0001,'Selected process has audio');assert(excluded<wanted/100,'Other process excluded by at least 40 dB');
console.log('PASS automatic multi-application mix, excluded process tree, graceful stop');
}finally{child?.kill();for(const c of contexts)await c.close();}
