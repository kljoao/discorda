import type {ChatAction,ChatResult} from '../shared/ipc/contracts';
import type {AuthController} from './auth/auth-controller';
export function opusRecording(bytes:Uint8Array){
 const buffer=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 return buffer.length>=32&&buffer.readUInt32BE(0)===0x1a45dfa3&&buffer.subarray(0,4096).includes(Buffer.from('webm'))&&buffer.subarray(0,65536).includes(Buffer.from('OpusHead'));
}
export async function sendVoiceMessage(auth:AuthController,action:Extract<ChatAction,{kind:'voiceSend'}>):Promise<ChatResult>{
 if(!opusRecording(action.bytes))return {ok:false,message:'A gravação não está em um formato de áudio válido. Grave novamente.'};
 return auth.chatRequest('/channels/'+action.channelId+'/attachments','POST',{clientId:action.clientId,name:`voz-${Math.round(action.durationMs)}ms-${action.clientId}.weba`,content:Buffer.from(action.bytes).toString('base64')});
}
