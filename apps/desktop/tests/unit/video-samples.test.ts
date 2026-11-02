import {expect,it} from 'vitest';
import {sampleVideo,videoHealth} from '../../src/renderer/features/chat/media-quality';
it('reports the main simulcast layer and resets interval metrics when report identity changes',()=>{
 const report=new Map([['low',{id:'low',type:'outbound-rtp',kind:'video',frameWidth:640,frameHeight:360,bytesSent:100,framesEncoded:30,timestamp:1000}],['main',{id:'main',type:'outbound-rtp',kind:'video',frameWidth:1920,frameHeight:1080,bytesSent:1000,framesEncoded:60,timestamp:1000,mediaSourceId:'source',totalEncodeTime:.1}],['source',{type:'media-source',framesPerSecond:60}]]);
 const first=sampleVideo(report as unknown as RTCStatsReport,true)!;expect(first.id).toBe('main');expect(first.captureFps).toBe(60);
 const next={...first,timestamp:2000,frames:120,bytes:2000,encodeTime:.4};expect(videoHealth(next,first)?.fps).toBe(60);expect(videoHealth(next,first)?.encodeMs).toBeCloseTo(5);expect(videoHealth({...next,id:'replacement'},first)).toBeUndefined();
});
