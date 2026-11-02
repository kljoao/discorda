import { VideoPreset, type LocalVideoTrack, type ScreenShareCaptureOptions, type TrackPublishOptions } from 'livekit-client';
export const screenProfiles = {
  '720': {width:1280,height:720,bitrate:8_000_000},
  '1080': {width:1920,height:1080,bitrate:20_000_000},
  '1440': {width:2560,height:1440,bitrate:30_000_000},
  '2160': {width:3840,height:2160,bitrate:50_000_000},
} as const;
export type ScreenIntent='auto'|'games'|'movies'|'text';
export function screenOptions(quality:keyof typeof screenProfiles|'auto',fps:30|60,intent:ScreenIntent='auto'):{capture:ScreenShareCaptureOptions;publish:TrackPublishOptions} {
  const automatic=quality==='auto';
  const profile=screenProfiles[automatic?'1080':quality];
  const h264=typeof RTCRtpSender!=='undefined'&&RTCRtpSender.getCapabilities('video')?.codecs.some(c=>c.mimeType.toLowerCase()==='video/h264');
  return {capture:{audio:false,resolution:{width:profile.width,height:profile.height,frameRate:fps},contentHint:intent==='text'?'detail':intent==='games'||intent==='movies'||fps===60?'motion':'detail'},
    publish:{videoCodec:h264?'h264':'vp8',simulcast:automatic,screenShareSimulcastLayers:automatic?[new VideoPreset(640,360,1_200_000,fps),new VideoPreset(1280,720,5_000_000,fps)]:undefined,screenShareEncoding:{maxBitrate:Math.round(profile.bitrate*(fps===30?0.7:1)),maxFramerate:fps,priority:'high'},degradationPreference:intent==='text'?'maintain-resolution':fps===60||intent==='games'||intent==='movies'?'maintain-framerate':'balanced'}};
}

/** Replacing a MediaStreamTrack does not update its RTP sender's encoding settings. */
export async function applyScreenEncoding(track:Pick<LocalVideoTrack,'sender'|'setDegradationPreference'>,options:ReturnType<typeof screenOptions>){
 await track.setDegradationPreference(options.publish.degradationPreference??'balanced');
 const sender=track.sender;if(!sender)return;
 const parameters=sender.getParameters(),top=options.publish.screenShareEncoding;
 if(!parameters.encodings?.length||!top)return;
 parameters.encodings.forEach((encoding,index)=>{
   encoding.maxFramerate=top.maxFramerate;
   // Preserve negotiated simulcast topology and LiveKit's inactive layer state.
   encoding.maxBitrate=index===parameters.encodings.length-1?top.maxBitrate:Math.min(top.maxBitrate??20_000_000,index===0?1_200_000:5_000_000);
 });
 await sender.setParameters(parameters);
}

export const sharingPresets = {
 auto:{label:'Automático',description:'Equilibra nitidez e fluidez conforme a rede.',quality:'auto',fps:60},
 games:{label:'Jogos',description:'Prioriza movimentos suaves a 60 fps, até 1080p.',quality:'auto',fps:60},
 movies:{label:'Filmes',description:'Vídeo a 30 fps, até 1080p, com som incluído.',quality:'auto',fps:30},
 text:{label:'Texto e código',description:'Prioriza a leitura em 1440p e 30 fps; exige mais banda.',quality:'1440',fps:30}
} as const;
