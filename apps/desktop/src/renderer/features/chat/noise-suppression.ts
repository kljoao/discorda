import workletUrl from './rnnoise-worklet.js?worker&url';
const modules=new WeakMap<AudioContext,Promise<void>>();
export type NoiseNode=AudioWorkletNode&{destroy:()=>void};
/** Model and WASM are embedded locally; no audio or assets use a CDN. */
export async function createNoiseSuppressor(context:AudioContext):Promise<NoiseNode>{
 if(context.sampleRate!==48000)throw Error('O filtro neural requer áudio a 48 kHz.');
 let loaded=modules.get(context);
 if(!loaded){loaded=context.audioWorklet.addModule(workletUrl).catch(error=>{modules.delete(context);throw error;});modules.set(context,loaded);}
 await loaded;
 const node=new AudioWorkletNode(context,'discorda-denoise',{channelCount:1,channelCountMode:'explicit',outputChannelCount:[1]}) as NoiseNode;
 node.destroy=()=>{node.port.postMessage('destroy');node.disconnect();};
 try{
  await new Promise<void>((resolve,reject)=>{
   const timer=setTimeout(()=>{node.port.onmessage=null;reject(Error('O filtro neural não respondeu.'));},5000);
   node.port.onmessage=event=>{clearTimeout(timer);node.port.onmessage=null;if(event.data?.ready)resolve();else reject(Error(event.data?.message??'Não foi possível iniciar o filtro neural.'));};
   node.onprocessorerror=()=>{clearTimeout(timer);reject(Error('O filtro neural foi interrompido.'));};
  });
  return node;
 }catch(error){node.destroy();throw error;}
}
