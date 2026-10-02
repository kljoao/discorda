import { VideoPreset, type ScreenShareCaptureOptions, type TrackPublishOptions } from 'livekit-client';
export const screenProfiles = {
  '720': {width:1280,height:720,bitrate:8_000_000},
  '1080': {width:1920,height:1080,bitrate:20_000_000},
  '1440': {width:2560,height:1440,bitrate:30_000_000},
  '2160': {width:3840,height:2160,bitrate:50_000_000},
} as const;
export type ScreenIntent='auto'|'games'|'text';
export function screenOptions(quality:keyof typeof screenProfiles|'auto',fps:30|60,intent:ScreenIntent='auto'):{capture:ScreenShareCaptureOptions;publish:TrackPublishOptions} {
  const automatic=quality==='auto';
  const profile=screenProfiles[automatic?'1080':quality];
  const h264=typeof RTCRtpSender!=='undefined'&&RTCRtpSender.getCapabilities('video')?.codecs.some(c=>c.mimeType.toLowerCase()==='video/h264');
  return {capture:{audio:false,resolution:{width:profile.width,height:profile.height,frameRate:fps},contentHint:intent==='text'?'detail':intent==='games'||fps===60?'motion':'detail'},
    publish:{videoCodec:h264?'h264':'vp8',simulcast:automatic,screenShareSimulcastLayers:automatic?[new VideoPreset(640,360,800_000,30),new VideoPreset(1280,720,4_000_000,fps)]:undefined,screenShareEncoding:{maxBitrate:Math.round(profile.bitrate*(fps===30?0.7:1)),maxFramerate:fps,priority:'high'},degradationPreference:intent==='games'?'maintain-framerate':intent==='text'?'maintain-resolution':automatic?'balanced':'maintain-resolution'}};
}
