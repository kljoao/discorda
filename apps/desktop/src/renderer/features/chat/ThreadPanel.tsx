import {useEffect,useMemo,useRef,useState} from 'react';
import type {ChatMessage,PresenceMember} from '../../../shared/ipc/contracts';
import {mergeMessages} from './Chat';
import {MessageFiles} from './Attachments';
import {formatMentions} from './mention-text';
import {scopedKey} from '../../lib/server-scope';
const drafts=new Map<string,{body:string;clientId?:string;replyToId?:string}>();
export function ThreadPanel({root,close,presence,userId,canModerate}:{root:ChatMessage;close:()=>void;presence:PresenceMember[];userId:string;canModerate:boolean}){
 const key=scopedKey('thread:'+root.channelId+':'+root.id+':'+userId);
 const [items,setItems]=useState<ChatMessage[]>([]),[draft,setDraft]=useState(drafts.get(key)?.body??''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[more,setMore]=useState(false),[loading,setLoading]=useState(false);
 const [reply,setReply]=useState<ChatMessage>(),[editing,setEditing]=useState<ChatMessage>(),[removing,setRemoving]=useState<string>();
 const input=useRef<HTMLTextAreaElement>(null),alive=useRef(true),fetching=useRef(false),historical=useRef(false),pending=useRef(drafts.get(key)?.clientId?drafts.get(key):undefined);
 const names=useMemo(()=>new Map(presence.map(p=>[p.id,p])),[presence]);
 function change(value:string){setDraft(value);drafts.set(key,{body:value});if(drafts.size>50)drafts.delete(drafts.keys().next().value!);}
 async function load(before?:string,reset=false){
  if(fetching.current)return;fetching.current=true;setLoading(true);
  try{
   const result=await window.discorda!.chat({kind:'history',channelId:root.channelId,thread:root.id,before});if(!result.ok)throw Error(result.message);
   const page=result.data as {items:ChatMessage[];hasMore:boolean};
   if(alive.current){historical.current=!!before;setItems(previous=>{const all=mergeMessages(reset?[]:previous,page.items);return before?all.slice(0,200):all.slice(-200);});setMore(page.hasMore);setError('');}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Não foi possível abrir o tópico.');}
  finally{fetching.current=false;if(alive.current)setLoading(false);}
 }
 useEffect(()=>{
  alive.current=true;void load();input.current?.focus();
  const off=window.discorda?.onLiveEvent(e=>{
   if(e.kind==='message'&&e.data.channelId===root.channelId&&e.data.threadRootId===root.id)setItems(old=>historical.current&&!old.some(m=>m.id===e.data.id)?old:mergeMessages(old,[e.data]).slice(-200));
   if(e.kind==='connection'&&e.data==='connected'&&!historical.current)void load();
  });const timer=setInterval(()=>{if(!historical.current&&document.visibilityState==='visible')void load();},30000);
  return()=>{alive.current=false;off?.();clearInterval(timer);};
 },[root.id]);
 async function send(){
  if(busy||!draft.trim())return;setBusy(true);setError('');
  if(!editing){pending.current??={clientId:crypto.randomUUID(),body:draft,replyToId:reply?.id??root.id};drafts.set(key,pending.current);}
  try{
   const result=await window.discorda!.chat(editing?{kind:'edit',channelId:root.channelId,id:editing.id,version:editing.version,body:draft}:{kind:'send',channelId:root.channelId,threadRootId:root.id,clientId:pending.current!.clientId!,body:pending.current!.body,replyToId:pending.current!.replyToId});
   if(!result.ok)throw Error(result.message);pending.current=undefined;drafts.delete(key);
   if(alive.current){setItems(old=>mergeMessages(old,[result.data as ChatMessage]).slice(-200));setDraft('');setReply(undefined);setEditing(undefined);if(historical.current)void load(undefined,true);}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Falha no envio.');}
  finally{if(alive.current){setBusy(false);requestAnimationFrame(()=>input.current?.focus());}}
 }
 async function remove(m:ChatMessage){setBusy(true);try{const result=await window.discorda!.chat({kind:'delete',channelId:root.channelId,id:m.id,version:m.version});if(!result.ok)throw Error(result.message);if(alive.current){setItems(old=>mergeMessages(old,[result.data as ChatMessage]));setRemoving(undefined);}}catch(e){setError(e instanceof Error?e.message:'Falha ao excluir.');}finally{if(alive.current)setBusy(false);}}
 return <aside className="thread-panel" aria-label="Tópico">
  <header><div><strong>Tópico</strong><small>Respostas separadas do canal</small></div><button aria-label="Fechar tópico" onClick={close}>×</button></header>
  <blockquote><strong>{root.authorName}</strong><p>{root.deletedAt?'Mensagem excluída':formatMentions(root.body,names).text}</p></blockquote>
  <div className="thread-messages" aria-live="polite">
   {more&&<button disabled={loading} onClick={()=>void load(items[0]?.id)}>Respostas anteriores</button>}
   {historical.current&&<button onClick={()=>void load(undefined,true)}>Voltar às respostas recentes</button>}
   {loading&&!items.length&&<p>Carregando tópico…</p>}{!loading&&!items.length&&<p>Aprofunde essa conversa aqui.</p>}
   {items.map(m=><article key={m.id}><strong>{m.authorName}</strong><time>{new Date(m.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time><p>{m.deletedAt?'Mensagem excluída':formatMentions(m.body,names).text}</p><MessageFiles message={m}/>
    {!m.deletedAt&&<div className="thread-actions"><button disabled={busy||!!pending.current} onClick={()=>{setReply(m);setEditing(undefined);input.current?.focus();}}>Responder</button>{m.authorId===userId&&<button disabled={busy||!!pending.current} onClick={()=>{setEditing(m);setReply(undefined);setDraft(m.body);input.current?.focus();}}>Editar</button>}{(m.authorId===userId||canModerate)&&<button disabled={busy} onClick={()=>setRemoving(m.id)}>Excluir</button>}</div>}
    {removing===m.id&&<div>Excluir resposta?<button disabled={busy} onClick={()=>void remove(m)}>Confirmar</button><button onClick={()=>setRemoving(undefined)}>Cancelar</button></div>}
   </article>)}
  </div>
  {error&&<p role="alert">{error}<button onClick={()=>void load()}>Atualizar</button></p>}
  <form onSubmit={e=>{e.preventDefault();void send();}}>
   {(reply||editing)&&<small>{editing?'Editando resposta':'Respondendo a '+reply?.authorName}<button type="button" disabled={busy||!!pending.current} onClick={()=>{setReply(undefined);setEditing(undefined);setDraft(drafts.get(key)?.body??'');}}>Cancelar</button></small>}
   <textarea ref={input} aria-label="Resposta no tópico" placeholder="Responder no tópico" maxLength={4000} value={draft} readOnly={busy||!!pending.current} onChange={e=>editing?setDraft(e.target.value):change(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/>
   <button disabled={busy||!draft.trim()||!!root.deletedAt}>{busy?'Enviando…':pending.current?'Tentar novamente':editing?'Salvar':'Responder'}</button>
  </form>
 </aside>;
}
