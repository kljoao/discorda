import { LocalAudioTrack, Track, type Room } from 'livekit-client';
export async function shareApplicationAudio(room:Room,id:string,onEnded:()=>void) {
  const context=new AudioContext({sampleRate:48000});
  let node:AudioWorkletNode|undefined, track:LocalAudioTrack|undefined, off:(()=>void)|undefined, offEnd:(()=>void)|undefined;
  let timer:ReturnType<typeof setInterval>|undefined;let stopped=false;
  const stop=async()=>{if(stopped)return;stopped=true;off?.();offEnd?.();if(timer)clearInterval(timer);await window.discorda!.applicationAudio({kind:'stop'}).catch(()=>{});if(track){await room.localParticipant.unpublishTrack(track).catch(()=>{});track.stop();}node?.port.postMessage({stop:true});node?.disconnect();if(context.state!=='closed')await context.close();};
  try {
    await context.audioWorklet.addModule(new URL('./application-audio-worklet.js',import.meta.url).href);
    node=new AudioWorkletNode(context,'discorda-application-audio',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
    const destination=context.createMediaStreamDestination();node.connect(destination);
    off=window.discorda!.onApplicationAudio(data=>{if(!stopped){const copy=new Uint8Array(data);node!.port.postMessage(copy.buffer,[copy.buffer]);}});
    offEnd=window.discorda!.onApplicationAudioEnd(()=>{void stop();onEnded();});
    await context.resume();await window.discorda!.applicationAudio({kind:'start',id});
    if(stopped)throw new Error('Audio capture ended');
    track=new LocalAudioTrack(destination.stream.getAudioTracks()[0],undefined,true);
    await room.localParticipant.publishTrack(track,{source:Track.Source.ScreenShareAudio,forceStereo:true,dtx:false,red:true,audioPreset:{maxBitrate:192000}});
    if(stopped){await room.localParticipant.unpublishTrack(track).catch(()=>{});track.stop();throw new Error('Audio capture ended');}
    timer=setInterval(()=>void window.discorda!.applicationAudio({kind:'pulse'}).catch(()=>{void stop();onEnded();}),2000);
    return stop;
  } catch(error){await stop();throw error;}
}
