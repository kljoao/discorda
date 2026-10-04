import {useState} from 'react';
import type {ChatMessage} from '../../../shared/ipc/contracts';
export function MessageFiles({message}:{message:ChatMessage}){
 const [preview,setPreview]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(message.deletedAt||!message.attachments?.length)return null;
 async function get(id:string,show:boolean){if(busy)return;setBusy(true);setError('');try{const result=await window.discorda!.chat({kind:'attachmentGet',channelId:message.channelId,id,preview:show});if(!result.ok)throw Error(result.message);if(show)setPreview((result.data as {preview:string}).preview);}catch(e){setError(e instanceof Error?e.message:'Não foi possível baixar.');}finally{setBusy(false);}}
 return <div className="message-files">{message.attachments.map(file=><div key={file.id} className="file-card"><strong>{file.name}</strong><small>{(file.size/1024/1024).toFixed(2)} MiB</small>{/\.(png|jpe?g|webp)$/i.test(file.name)&&<button disabled={busy} onClick={()=>preview?setPreview(undefined):void get(file.id,true)}>{preview?'Ocultar imagem':'Ver imagem'}</button>}<button disabled={busy} onClick={()=>void get(file.id,false)}>{busy?'Transferindo…':'Baixar'}</button></div>)}{preview&&<img className="attachment-preview" src={preview} alt="Imagem enviada no chat"/>}{error&&<p role="alert">{error}</p>}</div>;
}
