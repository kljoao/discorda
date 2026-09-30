import type { RemoteAudioTrack } from 'livekit-client';
import { playCallSound, type CallSound } from './call-sounds';
export type MemberVolume={voice:number;screen:number};
export const defaultVolume:MemberVolume={voice:150,screen:100};
export function clampVolume(value:number,fallback=150){return Number.isFinite(value)?Math.max(0,Math.min(400,value)):fallback;}
export function readVolumes():Record<string,MemberVolume>{
 try {const data=JSON.parse(localStorage.getItem('discorda:member-volumes')??'{}');return Object.fromEntries(Object.entries(data).filter(([,v])=>v&&typeof v==='object').map(([id,v])=>[id,{voice:clampVolume((v as MemberVolume).voice),screen:clampVolume((v as MemberVolume).screen,100)}]));}catch{return {};}
}
// One output context/limiter per call; tracks have separate gains. Muting never relies on HTML volume.
export class VoicePlayback {
 readonly context=new AudioContext();
 private limiter=this.context.createDynamicsCompressor();
 constructor(){this.limiter.threshold.value=-2;this.limiter.knee.value=0;this.limiter.ratio.value=20;this.limiter.attack.value=.003;this.limiter.release.value=.15;this.limiter.connect(this.context.destination);}
 async resume(){await this.context.resume();}
 async notify(kind:CallSound,volume:number){if(volume<=0||this.context.state==='closed')return;await this.resume();await playCallSound(this.context,this.limiter,kind,volume);}
 async output(id:string){const context=this.context as AudioContext&{setSinkId?:(id:string)=>Promise<void>};if(!context.setSinkId)throw new Error('Saída de áudio indisponível');await context.setSinkId(id);}
 attach(track:RemoteAudioTrack,element:HTMLAudioElement,volume:number){
  track.attach(element);element.muted=true;element.volume=0;
  const source=this.context.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
  const gain=this.context.createGain();gain.gain.value=clampVolume(volume)/100;source.connect(gain).connect(this.limiter);
  void this.resume();
  return {volume:(value:number)=>gain.gain.setTargetAtTime(clampVolume(value)/100,this.context.currentTime,.025),stop:()=>{source.disconnect();gain.disconnect();track.detach(element);}};
 }
 async close(){if(this.context.state!=='closed')await this.context.close();}
}
