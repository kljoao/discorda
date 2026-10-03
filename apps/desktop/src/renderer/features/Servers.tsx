import {useEffect,useRef,useState} from 'react';
import {Modal} from '../components/ui/modal';
import type {ServerList,ServerAction} from '../../shared/ipc/contracts';
export function Servers({pending=false}:{pending?:boolean}){
 const working=useRef(false);
 const dismiss=()=>{void window.discorda?.servers({kind:'dismissInvite'}).catch(()=>{});};
 const [open,setOpen]=useState(pending),[data,setData]=useState<ServerList>({servers:[]}),[address,setAddress]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(){const result=await window.discorda?.servers({kind:'list'});if(result){setData(result);if(result.pendingInvite){setAddress(result.pendingInvite);setOpen(true);}}}
 useEffect(()=>{void load().catch(()=>{});return window.discorda?.onInvite(()=>void load().catch(()=>{}));},[]);
 async function run(action:()=>Promise<void>){if(working.current)return;working.current=true;setBusy(true);setMessage('');try{await action();}catch(error){setMessage(error instanceof Error?error.message:'Não foi possível concluir.');}finally{working.current=false;setBusy(false);}}
 const perform=(action:ServerAction)=>run(async()=>{setData(await window.discorda!.servers(action));});
 return <><button className="server-entry" onClick={()=>{setOpen(true);void run(load);}}>Servidores e convites</button>{open&&<Modal label="Seus servidores" className="servers-dialog" onClose={()=>{if(!busy){setOpen(false);dismiss();}}}>
  <header><div><h2>Seus servidores</h2><p>Escolha seu grupo ou adicione uma comunidade.</p></div><button disabled={busy} onClick={()=>{setOpen(false);dismiss();}}>Fechar</button></header>
  {data.pendingInvite&&<p role="status">Você recebeu um convite. Confira o endereço com quem enviou antes de conectar.</p>}
  <ul className="server-list">{data.servers.map(server=><li key={server.id}><div><strong>{server.name}</strong><small>{server.address}{server.current?' · Atual':''}</small></div><button disabled={busy||server.current} onClick={()=>void perform({kind:'select',id:server.id})}>Conectar</button><details><summary>Opções</summary><form onSubmit={event=>{event.preventDefault();const name=String(new FormData(event.currentTarget).get('name')??'');void perform({kind:'rename',id:server.id,name});}}><label>Nome nesta máquina<input name="name" defaultValue={server.name} maxLength={60} required/></label><button disabled={busy}>Salvar nome</button></form><button disabled={busy||server.current} onClick={()=>void perform({kind:'remove',id:server.id})}>Remover da lista</button></details></li>)}</ul>
  <form onSubmit={event=>{event.preventDefault();void run(async()=>{const result=await window.discorda!.connectServer(address);setMessage(result.ok?'Conexão salva. Reiniciando…':result.message??'Não foi possível conectar.');});}}><label>Endereço ou convite do servidor<input value={address} onChange={e=>setAddress(e.target.value)} maxLength={1024} placeholder="grupo.exemplo.com, 26.x.x.x ou discorda://join…" required/></label><button disabled={busy||!address.trim()}>Adicionar e conectar</button></form>
  <p>A troca reinicia o aplicativo e encerra sua sessão. Saia da chamada antes de trocar. Seus rascunhos ficam salvos por servidor.</p>
  {data.servers.some(s=>s.current)&&<button disabled={busy} onClick={()=>void perform({kind:'invite'})}>Copiar convite do servidor atual</button>}
  {data.invite&&<label>Convite copiado<input readOnly value={data.invite} onFocus={e=>e.target.select()}/></label>}
  <small>O convite contém o endereço do servidor. Compartilhe apenas com as pessoas desejadas; o administrador ainda precisa autorizar o acesso.</small><p role="status">{busy?'Aguarde…':message}</p>
 </Modal>}</>;
}
