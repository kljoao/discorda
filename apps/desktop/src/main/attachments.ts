import {safeRaster} from './image-bounds';
import {dialog,nativeImage} from 'electron';
import {open,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {ChatAction,ChatResult} from '../shared/ipc/contracts';
import type {AuthController} from './auth/auth-controller';

const limit=8*1024*1024;
let busy=false;
export async function attachmentAction(auth:AuthController,action:Extract<ChatAction,{kind:'attachmentUpload'|'attachmentGet'}>):Promise<ChatResult>{
 if(busy)return {ok:false,message:'Aguarde o arquivo atual terminar.'};
 busy=true;const contextVersion=auth.contextVersion;
 try{
  const route='/channels/'+action.channelId+'/attachments';
  if(action.kind==='attachmentUpload'){
   const selected=await dialog.showOpenDialog({title:'Enviar arquivo ao canal · até 8 MiB',properties:['openFile']});
   if(selected.canceled||!selected.filePaths[0])return {ok:true,data:null};
   const file=await open(selected.filePaths[0],'r');
   try{
    const stat=await file.stat();if(!stat.isFile()||!stat.size||stat.size>limit)throw Error('Escolha um arquivo de até 8 MiB.');
    // Bound the read even if another process grows the file after stat.
    const buffer=Buffer.alloc(stat.size);let offset=0;
    while(offset<buffer.length){const {bytesRead}=await file.read(buffer,offset,buffer.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}
    if(offset!==buffer.length)throw Error('O arquivo mudou. Selecione novamente.');
    if(contextVersion!==auth.contextVersion)throw Error('A sessão mudou. Selecione o arquivo novamente.');
    return auth.chatRequest(route,'POST',{clientId:action.clientId,name:path.basename(selected.filePaths[0]),content:buffer.toString('base64')});
   }finally{await file.close();}
  }
  const result=await auth.chatRequest(route+'/'+action.id);if(!result.ok)return result;
  const data=result.data as {name?:unknown;content?:unknown};
  if(typeof data?.name!=='string'||typeof data.content!=='string'||data.content.length>Math.ceil(limit/3)*4)throw Error('Arquivo inválido.');
  const bytes=Buffer.from(data.content,'base64');if(bytes.length>limit)throw Error('Arquivo acima do limite.');
  if(action.preview){
   // Never give renderer-provided HTML/SVG or file paths to the browser.
   if(!safeRaster(bytes))throw Error('Prévia limitada a PNG/JPEG/WebP estáticos de até 20 megapixels. Use Baixar.');
   const image=nativeImage.createFromBuffer(bytes),size=image.getSize();
   if(image.isEmpty()||size.width*size.height>20_000_000)throw Error('Imagem grande demais para prévia. Use Baixar.');
   return {ok:true,data:{preview:'data:image/jpeg;base64,'+image.resize({width:Math.min(800,size.width)}).toJPEG(80).toString('base64')}};
  }
  const name=path.basename(data.name).replace(/[\x00-\x1f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g,'_').slice(0,180)||'arquivo';
  const target=await dialog.showSaveDialog({title:'Salvar arquivo · abra somente se confiar no remetente',defaultPath:name});
  if(contextVersion!==auth.contextVersion)throw Error('A sessão mudou. Baixe novamente.');
  if(!target.canceled&&target.filePath)await writeFile(target.filePath,bytes,{mode:0o600});
  return {ok:true,data:null};
 }catch(e){return {ok:false,message:e instanceof Error?e.message:'Não foi possível transferir o arquivo.'};}
 finally{busy=false;}
}
