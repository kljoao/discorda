import {useEffect,useRef,useState} from 'react';
import type {ChatMessage} from '../../../shared/ipc/contracts';
interface Staged {token:string;name:string;size:number;preview?:string}
export function useFileComposer(channelId:string,onSent:(message:ChatMessage)=>void){
 const input=useRef<HTMLInputElement>(null),alive=useRef(true),active=useRef<Staged|undefined>(undefined),working=useRef(false);
 const [file,setFile]=useState<Staged>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(0);
 const clientId=useRef(crypto.randomUUID());
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(active.current)void window.discorda?.chat({kind:'attachmentCancel',token:active.current.token});};},[]);
 async function stage(candidate?:File){if(!candidate||working.current)return;if(candidate.size===0||candidate.size>8*1024*1024){setError('Escolha um arquivo de até 8 MiB.');return;}working.current=true;setBusy(true);setError('');
  try{const bytes=new Uint8Array(await candidate.arrayBuffer());if(!alive.current)return;const r=await window.discorda!.chat({kind:'attachmentStage',name:candidate.name,bytes});if(!r.ok)throw Error(r.message);const staged=r.data as Staged;if(!alive.current){void window.discorda!.chat({kind:'attachmentCancel',token:staged.token});return;}active.current=staged;setFile(staged);clientId.current=crypto.randomUUID();setProgress(0);}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Não foi possível selecionar o arquivo.');}finally{working.current=false;if(alive.current)setBusy(false);}
 }
 async function cancel(){const current=active.current;if(current)await window.discorda!.chat({kind:'attachmentCancel',token:current.token});active.current=undefined;setFile(undefined);setError(busy?'Cancelamento solicitado. Se o servidor já confirmou, a mensagem pode aparecer no chat.':'');}
 async function send(){const current=active.current;if(!current||working.current)return;working.current=true;setBusy(true);setError('');
  const timer=setInterval(()=>void window.discorda!.chat({kind:'attachmentProgress',token:current.token}).then(r=>{if(alive.current&&r.ok)setProgress((r.data as {progress:number}).progress);}).catch(()=>{}),250);
  try{const r=await window.discorda!.chat({kind:'attachmentTransfer',channelId,clientId:clientId.current,token:current.token});if(!alive.current)return;if(r.ok){onSent(r.data as ChatMessage);active.current=undefined;setFile(undefined);setError('');}else if(active.current===current)throw Error(r.message);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Falha ao enviar. Tente novamente.');}finally{clearInterval(timer);working.current=false;if(alive.current)setBusy(false);}
 }
 return {stage,button:<><input ref={input} type="file" hidden onChange={e=>{void stage(e.target.files?.[0]);e.target.value='';}}/><button type="button" disabled={busy} title="Adicionar arquivo · arraste ou cole uma imagem" aria-label="Enviar arquivo" onClick={()=>input.current?.click()}>＋</button></>,
  panel:<>{file&&<aside className="file-composer" aria-label="Revisar arquivo antes de enviar">{file.preview&&<img src={file.preview} alt="Prévia do arquivo selecionado"/>}<div><strong>{file.name}</strong><small>{file.size<1024?file.size+' B':(file.size/1024).toFixed(0)+' KiB'} · até 8 MiB por arquivo</small>{busy&&<><progress value={progress} max={1}/><small>{progress<1?`${Math.round(progress*100)}% encaminhado`:'Aguardando confirmação do servidor…'}</small></>}<button disabled={busy} onClick={()=>void send()}>{busy?'Enviando…':'Enviar arquivo'}</button><button onClick={()=>void cancel()}>Cancelar</button></div></aside>}{error&&<p role="alert" className="chat-error">{error}</p>}</>};
}
