import {useEffect, useRef, useState} from 'react';
import {Search, Pin, X} from 'lucide-react';
import type {ChatAction, ChatMessage} from '../../../shared/ipc/contracts';

export async function chatRequest<T>(action:ChatAction):Promise<T> {
  const result=await window.discorda!.chat(action);
  if(!result.ok)throw Error(result.message);
  return result.data as T;
}
export const reactionEmojis=['👍','❤️','😂','🎉','👀','🔥'];
export interface Annotations {reactions:{id:string;emoji:string;count:number;mine:boolean}[];pins:string[]}

export function HistoryTools({channelId,onSelect}:{channelId:string;onSelect:(message:ChatMessage)=>void}) {
  const [mode,setMode]=useState<'search'|'pins'>(),[query,setQuery]=useState(''),[items,setItems]=useState<ChatMessage[]>([]),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[searched,setSearched]=useState(false);
  const revision=useRef(0),container=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!mode)return;const close=()=>{revision.current++;setBusy(false);setMode(undefined);};const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();close();}};const outside=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node))close();};document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};},[mode]);
  useEffect(()=>()=>{revision.current++;},[]);
  async function load(next:'search'|'pins',before?:string){
    if(next==='search'&&!query.trim())return;
    const ticket=++revision.current;setBusy(true);setError('');
    try{const result=await chatRequest<{items:ChatMessage[];hasMore:boolean}>(next==='search'?{kind:'search',channelId,query:query.trim(),before}:{kind:'pins',channelId,before});if(ticket!==revision.current)return;setSearched(true);setItems(old=>before?[...old,...result.items]:result.items);setMore(result.hasMore);}
    catch(e){if(ticket===revision.current)setError(e instanceof Error?e.message:'Não foi possível consultar.');}
    finally{if(ticket===revision.current)setBusy(false);}
  }
  return <div className="history-tools" ref={container}><button title="Buscar mensagens" aria-label="Buscar mensagens" aria-expanded={mode==='search'} onClick={()=>{revision.current++;setBusy(false);setMode('search');setSearched(false);setItems([]);setMore(false);}}><Search size={17}/></button><button title="Mensagens fixadas" aria-label="Mensagens fixadas" aria-expanded={mode==='pins'} onClick={()=>{setMode('pins');void load('pins');}}><Pin size={17}/></button>
    {mode&&<section className="history-popover" aria-label={mode==='search'?'Buscar no canal':'Mensagens fixadas'}><header><strong>{mode==='search'?'Buscar neste canal':'Mensagens fixadas'}</strong><button aria-label="Fechar busca" onClick={()=>{revision.current++;setBusy(false);setMode(undefined);}}><X size={16}/></button></header>
      {mode==='search'&&<form onSubmit={e=>{e.preventDefault();void load('search');}}><input autoFocus type="search" aria-label="Termos da busca" placeholder="Palavras da mensagem…" maxLength={120} value={query} onChange={e=>setQuery(e.target.value)}/><button disabled={busy||!query.trim()}>Buscar</button></form>}
      <div className="history-results">{items.map(m=><button key={m.id} onClick={()=>{onSelect(m);setMode(undefined);}}><strong>{m.authorName}</strong><time>{new Date(m.createdAt).toLocaleDateString('pt-BR')}</time><p>{m.body}</p></button>)}</div>
      {!busy&&!items.length&&<p>{mode==='pins'?'Nenhuma mensagem fixada.':searched?'Nenhuma mensagem encontrada. Tente outras palavras.':'Busque palavras no histórico deste canal.'}</p>}{error&&<p role="alert">{error}</p>}{busy&&<p role="status">Consultando…</p>}{more&&<button disabled={busy} onClick={()=>void load(mode,items.at(-1)?.id)}>Mais resultados</button>}
    </section>}
  </div>;
}
