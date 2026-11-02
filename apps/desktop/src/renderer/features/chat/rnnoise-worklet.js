import {Rnnoise} from '@shiguredo/rnnoise-wasm';
// Emscripten's embedded web build checks for this marker. AudioWorklet has a
// separate global scope, but supplies all the WASM primitives the module uses.
globalThis.WorkerGlobalScope??=class {};
let engine;
class VoiceDenoiser extends AudioWorkletProcessor {
 constructor(){
  super();this.stopped=false;this.filled=0;this.read=0;this.write=0;this.available=0;this.queue=new Float32Array(1920);
  this.port.onmessage=event=>{if(event.data==='destroy'){this.stopped=true;this.state?.destroy();this.state=undefined;}};
  engine??=Rnnoise.load();
  engine.then(rnnoise=>{if(this.stopped)return;this.frame=new Float32Array(rnnoise.frameSize);this.state=rnnoise.createDenoiseState();this.port.postMessage({ready:true});}).catch(error=>this.port.postMessage({error:true,message:String(error)}));
 }
 process(inputs,outputs){
  if(this.stopped)return false;
  const input=inputs[0]?.[0],output=outputs[0]?.[0];if(!output)return true;
  if(!this.state||!input){output.fill(0);return true;}
  for(let i=0;i<output.length;i++){
   output[i]=this.available>0?this.queue[this.read]:0;
   if(this.available>0){this.read=(this.read+1)%this.queue.length;this.available--;}
   this.frame[this.filled++]=Math.max(-1,Math.min(1,input[i]??0))*32768;
   if(this.filled===this.frame.length){this.state.processFrame(this.frame);this.filled=0;for(let j=0;j<this.frame.length;j++){this.queue[this.write]=this.frame[j]/32768;this.write=(this.write+1)%this.queue.length;}this.available+=this.frame.length;}
  }
  return true;
 }
}
registerProcessor('discorda-denoise',VoiceDenoiser);
