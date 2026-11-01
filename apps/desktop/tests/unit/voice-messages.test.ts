import {describe,it,expect,vi} from 'vitest';
import {opusRecording,sendVoiceMessage} from '../../src/main/voice-messages';
import {validateChatAction} from '../../src/main/chat';
vi.mock('electron',()=>({shell:{}}));
const channelId=crypto.randomUUID(),clientId=crypto.randomUUID();
function opus(){const data=Buffer.alloc(80);data.writeUInt32BE(0x1a45dfa3);data.write('webm',12);data.write('OpusHead',32);return new Uint8Array(data);}
describe('voice message boundary',()=>{
 it('requires real Opus/WebM headers rather than trusting a filename or MIME',()=>{expect(opusRecording(opus())).toBe(true);expect(opusRecording(new Uint8Array(80))).toBe(false);expect(opusRecording(Buffer.from('<html>not audio</html>'))).toBe(false);});
 it('bounds the capture size, duration and channel at the IPC boundary',()=>{const valid={kind:'voiceSend',channelId,clientId,bytes:opus(),durationMs:1800};expect(()=>validateChatAction(valid)).not.toThrow();for(const patch of [{channelId:'../admin'},{durationMs:NaN},{durationMs:499},{durationMs:120001},{bytes:new Uint8Array(8*1024*1024+1)},{clientId:'invalid'}])expect(()=>validateChatAction({...valid,...patch})).toThrow();});
 it('retains the idempotency key and round-trips original audio bytes',async()=>{const auth={chatRequest:vi.fn().mockResolvedValue({ok:true,data:{id:'1'}})},bytes=opus();await sendVoiceMessage(auth as never,{kind:'voiceSend',channelId,clientId,bytes,durationMs:1800});expect(auth.chatRequest).toHaveBeenCalledWith('/channels/'+channelId+'/attachments','POST',{clientId,name:`voz-1800ms-${clientId}.weba`,content:Buffer.from(bytes).toString('base64')});expect((await sendVoiceMessage(auth as never,{kind:'voiceSend',channelId,clientId,bytes:new Uint8Array(80),durationMs:1800})).ok).toBe(false);expect(auth.chatRequest).toHaveBeenCalledTimes(1);});
});
