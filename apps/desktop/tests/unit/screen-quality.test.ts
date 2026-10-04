import {describe,it,expect,vi} from 'vitest';
import {screenOptions,screenProfiles} from '../../src/renderer/features/chat/screen-quality';
describe('screen quality',()=>{
 it('always separates application audio from display capture and avoids low resolution simulcast fallback',()=>{
  for(const quality of Object.keys(screenProfiles) as (keyof typeof screenProfiles)[])for(const fps of [30,60] as const){
   const {capture,publish}=screenOptions(quality,fps);
   expect(capture.audio).toBe(false);expect(capture.resolution?.frameRate).toBe(fps);
   expect(publish.screenShareEncoding?.maxFramerate).toBe(fps);
   expect(publish.screenShareEncoding!.maxBitrate).toBeGreaterThanOrEqual(5_000_000);
   expect(publish.simulcast).toBe(false);expect(publish.degradationPreference).toBe('maintain-resolution');
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
 const {capture,publish}=screenOptions('auto',60);expect(capture.resolution).toMatchObject({width:1920,height:1080,frameRate:60});expect(publish.simulcast).toBe(true);expect(publish.screenShareSimulcastLayers).toHaveLength(2);expect(publish.degradationPreference).toBe('balanced');
});

it('keeps text sharp and movies smooth without enabling capture audio',()=>{
 expect(screenOptions('1440',30,'text').publish.degradationPreference).toBe('maintain-resolution');
 const movies=screenOptions('auto',30,'movies');expect(movies.capture.contentHint).toBe('motion');expect(movies.publish.degradationPreference).toBe('maintain-framerate');expect(movies.capture.audio).toBe(false);
});
