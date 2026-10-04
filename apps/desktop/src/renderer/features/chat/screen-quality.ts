import { VideoPreset, type ScreenShareCaptureOptions, type TrackPublishOptions } from 'livekit-client';
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
    publish:{videoCodec:h264?'h264':'vp8',simulcast:automatic,screenShareSimulcastLayers:automatic?[new VideoPreset(640,360,800_000,30),new VideoPreset(1280,720,4_000_000,fps)]:undefined,screenShareEncoding:{maxBitrate:Math.round(profile.bitrate*(fps===30?0.7:1)),maxFramerate:fps,priority:'high'},degradationPreference:intent==='games'||intent==='movies'?'maintain-framerate':intent==='text'?'maintain-resolution':automatic?'balanced':'maintain-resolution'}};
}

export const sharingPresets = {
 auto:{label:'Automático',description:'Equilibra nitidez e fluidez conforme a rede.',quality:'auto',fps:60},
 games:{label:'Jogos',description:'Prioriza movimentos suaves a 60 fps, até 1080p.',quality:'auto',fps:60},
 movies:{label:'Filmes',description:'Vídeo a 30 fps, até 1080p. Ative o som se desejar.',quality:'auto',fps:30},
 text:{label:'Texto e código',description:'Prioriza a leitura em 1440p e 30 fps; exige mais banda.',quality:'1440',fps:30}
} as const;
