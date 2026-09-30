import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';
export interface MicrophoneSettings { noiseSuppression?:boolean; gain: number; threshold: number; gate: boolean; deviceId: string; }
const defaults: MicrophoneSettings = {gain:1,threshold:-50,gate:true,noiseSuppression:true,deviceId:''};
export function readMicrophoneSettings(): MicrophoneSettings {
  try { const value = JSON.parse(localStorage.getItem('discorda:microphone') ?? '{}');
    return {gain: typeof value.gain === 'number' && Number.isFinite(value.gain) ? Math.max(0,Math.min(2,value.gain)) : 1,
      threshold:typeof value.threshold === 'number' && Number.isFinite(value.threshold) ? Math.max(-70,Math.min(-10,value.threshold)) : -50,
      noiseSuppression:typeof value.noiseSuppression==='boolean'?value.noiseSuppression:true,
      gate:typeof value.gate === 'boolean' ? value.gate : true, deviceId:typeof value.deviceId === 'string' ? value.deviceId : ''};
  } catch { return {...defaults}; }
}
const modules = new WeakMap<AudioContext, Promise<void>>();
export class MicrophoneProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = 'discorda-microphone';
  processedTrack?: MediaStreamTrack;
  private source?: MediaStreamAudioSourceNode;
  private node?: AudioWorkletNode;
  private destination?: MediaStreamAudioDestinationNode;
  onLevel?: (level: {db:number;open:boolean}) => void;
  constructor(public settings: MicrophoneSettings) {}
  configure(settings: MicrophoneSettings) { this.settings = settings; this.node?.port.postMessage(settings); }
  async init({audioContext,track}: AudioProcessorOptions) {
    let loaded = modules.get(audioContext);
    if (!loaded) { loaded = audioContext.audioWorklet.addModule(new URL('./microphone-worklet.js',import.meta.url).href); modules.set(audioContext,loaded); }
    await loaded;
    this.source = audioContext.createMediaStreamSource(new MediaStream([track]));
    this.node = new AudioWorkletNode(audioContext,'discorda-microphone');
    this.destination = audioContext.createMediaStreamDestination();
    this.node.port.onmessage = event => this.onLevel?.(event.data);
    this.configure(this.settings);
    this.source.connect(this.node).connect(this.destination);
    this.processedTrack = this.destination.stream.getAudioTracks()[0];
    await audioContext.resume();
  }
  async restart(options: AudioProcessorOptions) { await this.destroy(); await this.init(options); }
  async destroy() {
    this.source?.disconnect(); this.node?.disconnect(); this.destination?.disconnect();
    if (this.node) {this.node.port.postMessage({stop:true}); this.node.port.onmessage = null; this.node.port.close();}
    this.processedTrack?.stop(); this.processedTrack=undefined; this.source=undefined; this.node=undefined; this.destination=undefined;
  }
}
