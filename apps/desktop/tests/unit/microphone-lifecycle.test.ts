import {expect,it,vi} from 'vitest';
import {MicrophoneProcessor} from '../../src/renderer/features/chat/microphone';
it('does not create capture nodes when destroyed during module loading',async()=>{
 let finish!:()=>void;const loaded=new Promise<void>(resolve=>{finish=resolve;});
 const source=vi.fn();const context={audioWorklet:{addModule:()=>loaded},createMediaStreamSource:source};
 const processor=new MicrophoneProcessor({gain:1,threshold:-50,gate:true,deviceId:''});
 const init=processor.init({audioContext:context as unknown as AudioContext,track:{} as MediaStreamTrack,kind:'audio' as never});
 const check=expect(init).rejects.toThrow('cancelada');await processor.destroy();finish();await check;expect(source).not.toHaveBeenCalled();expect(processor.processedTrack).toBeUndefined();
});
