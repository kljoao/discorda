import {chromium,expect,test} from '@playwright/test';
import {createServer} from 'vite';

test('real audio worklet passes quiet push-to-talk and recovers after replacing the input',async()=>{
  const server=await createServer({cacheDir:"node_modules/.vite-e2e-microphone",optimizeDeps:{entries:["index.html"]},server:{port:5185,strictPort:true}});
  await server.listen();
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  try{
    const page=await browser.newPage();await page.goto('http://localhost:5185');
    const result=await page.evaluate(async()=>{
      const modulePath='/src/renderer/features/chat/microphone.ts';
      const {MicrophoneProcessor}=await import(modulePath);
      const context=new AudioContext(),oscillator=context.createOscillator(),gain=context.createGain();
      const input=context.createMediaStreamDestination();gain.gain.value=0.01;
      oscillator.connect(gain).connect(input);oscillator.start();
      const processor=new MicrophoneProcessor({gain:1,threshold:-10,gate:true,pushToTalk:true,deviceId:''});
      const analyser=context.createAnalyser();analyser.fftSize=2048;
      let source:MediaStreamAudioSourceNode|undefined;
      const connect=()=>{source?.disconnect();source=context.createMediaStreamSource(new MediaStream([processor.processedTrack]));source.connect(analyser);};
      const sample=async(talk:boolean)=>{
        const heartbeat=talk?setInterval(()=>processor.talk(true),80):undefined;
        if(talk)processor.talk(true);
        await new Promise(resolve=>setTimeout(resolve,500));
        const values=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(values);
        if(heartbeat)clearInterval(heartbeat);
        return Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);
      };
      try{
        await processor.init({audioContext:context,track:input.stream.getAudioTracks()[0],kind:'audio'});connect();
        const idle=await sample(false),speaking=await sample(true),expired=await sample(false);
        await processor.restart({audioContext:context,track:input.stream.getAudioTracks()[0],kind:'audio'});connect();
        const restarted=await sample(true);
        return {idle,speaking,expired,restarted};
      }finally{source?.disconnect();await processor.destroy();oscillator.stop();input.stream.getTracks().forEach(track=>track.stop());await context.close();}
    });
    expect(result.idle).toBeLessThan(0.00001);
    expect(result.speaking).toBeGreaterThan(0.001);
    expect(result.expired).toBeLessThan(0.0001);
    expect(result.restarted).toBeGreaterThan(0.001);
  }finally{await browser.close();await server.close();}
});
