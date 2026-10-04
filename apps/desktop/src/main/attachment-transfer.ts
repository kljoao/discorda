import {randomUUID} from 'node:crypto';
import {nativeImage} from 'electron';
import {safeRaster} from './image-bounds';
import type {AuthController} from './auth/auth-controller';
import type {ChatAction,ChatResult} from '../shared/ipc/contracts';
type Action=Extract<ChatAction,{kind:'attachmentStage'|'attachmentTransfer'|'attachmentProgress'|'attachmentCancel'}>;
let staged:{token:string;auth:AuthController;epoch:number;name:string;bytes:Buffer;expires:number;progress:number;controller?:AbortController}|undefined;
export async function stagedAttachmentAction(auth:AuthController,action:Action):Promise<ChatResult>{
 if(staged&&(staged.expires<Date.now()||staged.auth!==auth||staged.epoch!==auth.contextVersion)){staged.controller?.abort();staged=undefined;}
 if(action.kind==='attachmentStage'){
  if(staged?.controller)return {ok:false,message:'Aguarde ou cancele o envio atual.'};
  if(/[\p{Cc}\p{Cf}/\\:]/u.test(action.name))return {ok:false,message:'Nome de arquivo inválido.'};
  const bytes=Buffer.from(action.bytes);let preview:string|undefined;
  if(safeRaster(bytes)){const image=nativeImage.createFromBuffer(bytes);if(!image.isEmpty())preview='data:image/jpeg;base64,'+image.resize({width:Math.min(640,image.getSize().width)}).toJPEG(80).toString('base64');}
  staged={token:randomUUID(),auth,epoch:auth.contextVersion,name:action.name,bytes,expires:Date.now()+15*60_000,progress:0};
  return {ok:true,data:{token:staged.token,name:staged.name,size:bytes.length,preview}};
 }
 const current=staged;if(!current||current.token!==action.token)return {ok:false,message:'O arquivo expirou. Selecione novamente.'};
 if(action.kind==='attachmentProgress')return {ok:true,data:{progress:current.progress}};
 if(action.kind==='attachmentCancel'){current.controller?.abort();staged=undefined;return {ok:true,data:null};}
 if(action.kind!=='attachmentTransfer'||current.controller)return {ok:false,message:'Um envio já está em andamento.'};
 current.controller=new AbortController();current.progress=0;
 const result=await auth.chatRequest('/channels/'+action.channelId+'/attachments','POST',{clientId:action.clientId,name:current.name,content:current.bytes.toString('base64')},'chat',{signal:current.controller.signal,progress:f=>{current.progress=f;}});
 current.controller=undefined;
 if(result.ok&&staged===current)staged=undefined;
 return result;
}
