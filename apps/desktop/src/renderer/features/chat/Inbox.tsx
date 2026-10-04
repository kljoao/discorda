import {useEffect,useRef,useState} from 'react';
import {Inbox as InboxIcon} from 'lucide-react';
import {Modal} from '../../components/ui/modal';
export interface InboxItem {id:string;channelId:string;channelName:string;authorName:string;body:string;createdAt:string;threadRootId?:string;kind:string;read:boolean}
export function Inbox({onSelect,onOpenChange}:{onOpenChange?:(value:boolean)=>void;onSelect:(item:InboxItem)=>void}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<InboxItem[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[more,setMore]=useState(false),[unread,setUnread]=useState(true);
 useEffect(()=>{onOpenChange?.(open);return()=>onOpenChange?.(false);},[open]);
 const epoch=useRef(0),loading=useRef(false),paged=useRef(false);
 async function load(before?:string){if(loading.current)return;loading.current=true;setBusy(true);const generation=++epoch.current;paged.current=!!before;
  try{const r=await window.discorda!.chat({kind:'inbox',unread,before});if(!r.ok)throw Error(r.message);if(generation!==epoch.current)return;
   const page=r.data as {items:InboxItem[];hasMore:boolean};setItems(old=>before?[...old,...page.items].slice(-250):page.items);setMore(page.hasMore);setError('');
  }catch{if(generation===epoch.current)setError('Não foi possível carregar a caixa de entrada. Verifique se o servidor está atualizado.');}finally{if(generation===epoch.current){loading.current=false;setBusy(false);}}
 }
 useEffect(()=>{if(!open)return;loading.current=false;void load();const timer=setInterval(()=>{if(!paged.current&&document.visibilityState==='visible')void load();},15000);return()=>{epoch.current++;clearInterval(timer);};},[open,unread]);
 async function mark(item:InboxItem,jump=false){if(jump){onSelect(item);setOpen(false);return;}try{const r=await window.discorda!.chat({kind:'inboxRead',id:item.id});if(!r.ok){setError(r.message);return;}setItems(old=>unread?old.filter(i=>i.id!==item.id):old.map(i=>i.id===item.id?{...i,read:true}:i));if(jump){onSelect(item);setOpen(false);}}catch{setError('Não foi possível marcar a mensagem. Tente novamente.');}}
 return <><button className="inbox-launch" onClick={()=>setOpen(true)}><InboxIcon size={17}/> Caixa de entrada</button>{open&&<Modal label="Caixa de entrada" className="inbox-dialog" onClose={()=>setOpen(false)}><header><h2>Caixa de entrada</h2><button aria-label="Fechar caixa de entrada" onClick={()=>setOpen(false)}>×</button></header>
  <p>Menções, respostas e novidades dos tópicos que você segue.</p><div className="inbox-toolbar"><label><input type="checkbox" checked={unread} onChange={e=>setUnread(e.target.checked)}/> Apenas não lidas</label>
  <button disabled={busy} onClick={()=>void load()}>Atualizar caixa de entrada</button></div>
  {error&&<p role="alert">{error} <button onClick={()=>void load()}>Tentar novamente</button></p>}
  <div className="inbox-items">{items.map(item=><article key={item.id} className={item.read?'read':''}><small>#{item.channelName} · {item.kind==='mention'?'Menção':item.kind==='reply'?'Resposta':'Tópico'} · {new Date(item.createdAt).toLocaleString('pt-BR')}</small><strong>{item.authorName}</strong><p>{item.body.replace(/<@[0-9a-f-]+>/gi,'@membro')}</p><div><button onClick={()=>void mark(item,true)}>Abrir mensagem</button>{!item.read&&<button onClick={()=>void mark(item)}>Marcar como lida</button>}</div></article>)}</div>
  {!busy&&!items.length&&!error&&<p role="status">Tudo em dia por aqui.</p>}{busy&&<p role="status">Carregando…</p>}{more&&<button disabled={busy} onClick={()=>void load(items.at(-1)?.id)}>Carregar anteriores</button>}
 </Modal>}</>;
}
