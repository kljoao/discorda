import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';
import {createNoiseSuppressor} from './noise-suppression';
export type NoiseMode='neural'|'standard'|'off';
export interface MicrophoneSettings { noiseMode?:NoiseMode;autoGain?:boolean;pushToTalk?:boolean; noiseSuppression?:boolean; gain: number; threshold: number; gate: boolean; deviceId: string; }
export const noiseMode=(settings:MicrophoneSettings):NoiseMode=>settings.noiseSuppression===false?'off':settings.noiseMode??'neural';
export function voiceCaptureOptions(settings:MicrophoneSettings){return {deviceId:settings.deviceId?{exact:settings.deviceId}:undefined,echoCancellation:true,noiseSuppression:noiseMode(settings)!=='off',autoGainControl:settings.autoGain!==false,channelCount:1,sampleRate:48000};}
const defaults: MicrophoneSettings = {gain:1,threshold:-50,gate:true,noiseSuppression:true,deviceId:''};
export function readMicrophoneSettings(): MicrophoneSettings {
  try { const value = JSON.parse(localStorage.getItem('discorda:microphone') ?? '{}');
    return {gain: typeof value.gain === 'number' && Number.isFinite(value.gain) ? Math.max(0,Math.min(2,value.gain)) : 1,
      threshold:typeof value.threshold === 'number' && Number.isFinite(value.threshold) ? Math.max(-70,Math.min(-10,value.threshold)) : -50,
      noiseSuppression:typeof value.noiseSuppression==='boolean'?value.noiseSuppression:true,
      noiseMode:['neural','standard','off'].includes(value.noiseMode)?value.noiseMode:undefined,autoGain:value.autoGain!==false,
      gate:typeof value.gate === 'boolean' ? value.gate : true, deviceId:typeof value.deviceId === 'string' ? value.deviceId : ''};
  } catch { return {...defaults}; }
}
const modules = new WeakMap<AudioContext, Promise<void>>();
export class MicrophoneProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'discorda-microphone';
  processedTrack?: MediaStreamTrack;
  private generation=0;
  private source?: MediaStreamAudioSourceNode;
  private node?: AudioWorkletNode;
  private destination?: MediaStreamAudioDestinationNode;
  private context?:AudioContext;
  private input?:MediaStreamTrack;
  private highpass?:BiquadFilterNode;
  private denoiser?:Awaited<ReturnType<typeof createNoiseSuppressor>>;
  private filterRevision=0;
  processing:NoiseMode='standard';
  processingWarning='';
  onLevel?: (level: {db:number;open:boolean}) => void;
  constructor(public settings: MicrophoneSettings) {}
  talk(pressed:boolean){this.node?.port.postMessage({talk:pressed});}
  configure(settings: MicrophoneSettings) { const previous=noiseMode(this.settings),gain=this.settings.autoGain;this.settings = settings; this.node?.port.postMessage(settings);if(this.context&&(previous!==noiseMode(settings)||gain!==settings.autoGain))void this.filter(); }
  private async filter(){
    const revision=++this.filterRevision,context=this.context,input=this.input,source=this.source,highpass=this.highpass;
    if(!context||!input||!source||!highpass)return;
    let next:typeof this.denoiser;
    const mode=noiseMode(this.settings);
    this.processingWarning='';
    try{if(mode==='neural')next=await createNoiseSuppressor(context);}
    catch{this.processingWarning='Filtro neural indisponível. Usando a supressão padrão do dispositivo.';}
    if(revision!==this.filterRevision){next?.destroy();next?.disconnect();return;}
    let effective:NoiseMode=next?'neural':mode==='off'?'off':'standard';
    try{await input.applyConstraints({echoCancellation:true,autoGainControl:this.settings.autoGain!==false,noiseSuppression:effective==='standard'});}
    catch{next?.destroy();next?.disconnect();next=undefined;effective=mode==='off'?'off':'standard';this.processingWarning='Este microfone não permitiu atualizar os filtros de captura. Reconecte-o para aplicar.';}
    if(revision!==this.filterRevision){next?.destroy();next?.disconnect();return;}
    source.disconnect();this.denoiser?.destroy();this.denoiser?.disconnect();this.denoiser=next;
    if(next){next.onprocessorerror=()=>{if(this.denoiser!==next)return;this.settings={...this.settings,noiseMode:'standard'};void this.filter();this.processingWarning='O filtro neural foi interrompido. Supressão padrão ativada.';};source.connect(next).connect(highpass);}else source.connect(highpass);
    this.processing=effective;
  }
  async init({audioContext,track}: AudioProcessorOptions) {
    const generation=++this.generation;
    let loaded = modules.get(audioContext);
    if (!loaded) { loaded = audioContext.audioWorklet.addModule(new URL('./microphone-worklet.js',import.meta.url).href).catch(error=>{modules.delete(audioContext);throw error;}); modules.set(audioContext,loaded); }
    await loaded;
    if(generation!==this.generation)throw new Error('Inicialização do microfone cancelada.');
    this.source = audioContext.createMediaStreamSource(new MediaStream([track]));
    this.context=audioContext;this.input=track;
    this.node = new AudioWorkletNode(audioContext,'discorda-microphone',{channelCount:1,channelCountMode:'explicit',outputChannelCount:[1]});
    this.highpass=audioContext.createBiquadFilter();this.highpass.type='highpass';this.highpass.frequency.value=75;this.highpass.Q.value=.707;
    this.destination = audioContext.createMediaStreamDestination();
    this.destination.channelCount=1;
    this.node.port.onmessage = event => this.onLevel?.(event.data);
    this.node.port.postMessage(this.settings);
    this.highpass.connect(this.node).connect(this.destination);
    await audioContext.resume();
    await this.filter();
    if(generation!==this.generation)throw new Error('Inicialização do microfone cancelada.');
    this.processedTrack = this.destination.stream.getAudioTracks()[0];
    await audioContext.resume();
  }
  async restart(options: AudioProcessorOptions) { await this.destroy(); await this.init(options); }
  async destroy() {
    this.generation++;this.filterRevision++;this.context=undefined;this.input=undefined;
    this.denoiser?.destroy();this.denoiser?.disconnect();this.denoiser=undefined;this.highpass?.disconnect();this.highpass=undefined;
    this.source?.disconnect(); this.node?.disconnect(); this.destination?.disconnect();
    if (this.node) {this.node.port.postMessage({stop:true}); this.node.port.onmessage = null; this.node.port.close();}
    this.processedTrack?.stop(); this.processedTrack=undefined; this.source=undefined; this.node=undefined; this.destination=undefined;
  }
}
