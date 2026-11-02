import {describe,it,expect,vi} from 'vitest';
import {screenOptions,screenProfiles,applyScreenEncoding} from '../../src/renderer/features/chat/screen-quality';
describe('screen quality',()=>{
 it('always separates application audio from display capture and avoids low resolution simulcast fallback',()=>{
  for(const quality of Object.keys(screenProfiles) as (keyof typeof screenProfiles)[])for(const fps of [30,60] as const){
   const {capture,publish}=screenOptions(quality,fps);
   expect(capture.audio).toBe(false);expect(capture.resolution?.frameRate).toBe(fps);
   expect(publish.screenShareEncoding?.maxFramerate).toBe(fps);
   expect(publish.screenShareEncoding!.maxBitrate).toBeGreaterThanOrEqual(5_000_000);
   expect(publish.simulcast).toBe(false);expect(publish.degradationPreference).toBe(fps===60?'maintain-framerate':'balanced');
  }
 });
 it('uses a codec available on the sender',()=>{
  vi.stubGlobal('RTCRtpSender',{getCapabilities:()=>({codecs:[{mimeType:'video/H264'}]})});
  expect(screenOptions('1080',60).publish.videoCodec).toBe('h264');
  vi.stubGlobal('RTCRtpSender',{getCapabilities:()=>({codecs:[{mimeType:'video/VP8'}]})});
  expect(screenOptions('1080',60).publish.videoCodec).toBe('vp8');
  vi.unstubAllGlobals();
 });
});
it('offers receiver layers only in automatic mode while keeping a 1080p60 top layer',()=>{
 const {capture,publish}=screenOptions('auto',60);expect(capture.resolution).toMatchObject({width:1920,height:1080,frameRate:60});expect(publish.simulcast).toBe(true);expect(publish.screenShareSimulcastLayers).toHaveLength(2);expect(publish.degradationPreference).toBe('maintain-framerate');
});

it('keeps text sharp and movies smooth without enabling capture audio',()=>{
 expect(screenOptions('1440',30,'text').publish.degradationPreference).toBe('maintain-resolution');
 const movies=screenOptions('auto',30,'movies');expect(movies.capture.contentHint).toBe('motion');expect(movies.publish.degradationPreference).toBe('maintain-framerate');expect(movies.capture.audio).toBe(false);
});

it('updates existing sender limits when changing from 30 fps to 1080p60 without waking inactive layers',async()=>{
 const parameters={encodings:[{rid:'q',active:false,maxFramerate:30,maxBitrate:800000},{rid:'f',active:true,maxFramerate:30,maxBitrate:4000000}]};
 const sender={getParameters:()=>parameters,setParameters:vi.fn().mockResolvedValue(undefined)} as unknown as RTCRtpSender;
 const preference=vi.fn().mockResolvedValue(undefined);await applyScreenEncoding({sender,setDegradationPreference:preference},screenOptions('1080',60));
 expect(preference).toHaveBeenCalledWith('maintain-framerate');expect(parameters.encodings[0].active).toBe(false);expect(parameters.encodings[1]).toMatchObject({maxFramerate:60,maxBitrate:20000000});expect(sender.setParameters).toHaveBeenCalledWith(parameters);
});
