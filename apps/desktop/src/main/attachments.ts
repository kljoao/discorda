import {safeRaster} from './image-bounds';
import {dialog,nativeImage,clipboard,ClipboardItem} from 'electron';
import {open,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {ChatAction,ChatResult} from '../shared/ipc/contracts';
import type {AuthController} from './auth/auth-controller';

const limit=8*1024*1024;
let busy=false;
export async function attachmentAction(auth:AuthController,action:Extract<ChatAction,{kind:'attachmentUpload'|'attachmentGet'}>):Promise<ChatResult>{
 const operation=action.kind==='attachmentGet'?(action.operation??(action.preview?'preview':'download')):'upload';
 const exclusive=operation==='upload'||operation==='download';
 if(exclusive&&busy)return {ok:false,message:'Aguarde o arquivo atual terminar.'};
 if(exclusive)busy=true;const contextVersion=auth.contextVersion;
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
  if(contextVersion!==auth.contextVersion)throw Error('A sessão mudou. Abra o arquivo novamente.');
  if(operation==='copyLink'){
   await clipboard.writeText(auth.attachmentUrl(action.channelId,action.id));
   return {ok:true,data:{message:'Link copiado. O acesso ao arquivo exige uma sessão autorizada no servidor.'}};
  }
  if(operation==='preview'&&/\.(weba|ogg|mp3|wav|m4a|flac)$/i.test(data.name)){
   const webm=/\.weba$/i.test(data.name)&&bytes.length>=16&&bytes.readUInt32BE(0)===0x1a45dfa3&&bytes.subarray(0,4096).includes(Buffer.from('webm'));
   const ogg=/\.ogg$/i.test(data.name)&&bytes.toString('ascii',0,4)==='OggS';
   const wav=/\.wav$/i.test(data.name)&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE';
   const mp3=/\.mp3$/i.test(data.name)&&(bytes.toString('ascii',0,3)==='ID3'||bytes[0]===255&&(bytes[1]&0xe0)===0xe0);
   const m4a=/\.m4a$/i.test(data.name)&&bytes.toString('ascii',4,8)==='ftyp';
   const flac=/\.flac$/i.test(data.name)&&bytes.toString('ascii',0,4)==='fLaC';
   if(!webm&&!ogg&&!wav&&!mp3&&!m4a&&!flac)throw Error('O formato deste áudio não permite reprodução. Você pode baixar o arquivo.');
   const duration=Number(/^voz-(\d+)ms-/.exec(data.name)?.[1]??0)/1000;
   return {ok:true,data:{content:bytes.toString('base64'),mime:webm?'audio/webm':ogg?'audio/ogg':wav?'audio/wav':mp3?'audio/mpeg':m4a?'audio/mp4':'audio/flac',kind:'audio',duration:duration>0&&duration<=120?duration:undefined}};
  }
  if(operation==='preview'&&/\.(mp4|webm)$/i.test(data.name)){
   const mp4=/\.mp4$/i.test(data.name)&&bytes.length>=12&&bytes.toString('ascii',4,8)==='ftyp';
   const webm=/\.webm$/i.test(data.name)&&bytes.length>=16&&bytes.readUInt32BE(0)===0x1a45dfa3&&bytes.subarray(0,4096).includes(Buffer.from('webm'));
   if(!mp4&&!webm)throw Error('O formato deste vídeo não permite prévia. Você pode baixar o arquivo.');
   return {ok:true,data:{content:bytes.toString('base64'),mime:mp4?'video/mp4':'video/webm',kind:'video'}};
  }
  if(operation==='preview'||operation==='copyImage'){
   // Never give renderer-provided HTML/SVG or file paths to the browser.
   if(!safeRaster(bytes))throw Error('Prévia limitada a PNG/JPEG/WebP estáticos de até 20 megapixels. Use Baixar.');
   const image=nativeImage.createFromBuffer(bytes),size=image.getSize();
   if(image.isEmpty()||size.width*size.height>20_000_000)throw Error('Imagem grande demais para prévia. Use Baixar.');
   if(operation==='copyImage'){
    await clipboard.write([new ClipboardItem({'image/png':new Blob([new Uint8Array(image.toPNG())],{type:'image/png'})})]);
    return {ok:true,data:{message:'Imagem copiada.'}};
   }
   const scale=Math.min(1,1920/size.width,1920/size.height);
   return {ok:true,data:{preview:'data:image/png;base64,'+image.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale)),quality:'best'}).toPNG().toString('base64'),kind:'image'}};
  }
  const name=path.basename(data.name).replace(/[\x00-\x1f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g,'_').slice(0,180)||'arquivo';
  const target=await dialog.showSaveDialog({title:'Salvar arquivo · abra somente se confiar no remetente',defaultPath:name});
  if(contextVersion!==auth.contextVersion)throw Error('A sessão mudou. Baixe novamente.');
  if(!target.canceled&&target.filePath)await writeFile(target.filePath,bytes,{mode:0o600});
  return {ok:true,data:{canceled:target.canceled}};
 }catch(e){return {ok:false,message:e instanceof Error?e.message:'Não foi possível transferir o arquivo.'};}
 finally{if(exclusive)busy=false;}
}
