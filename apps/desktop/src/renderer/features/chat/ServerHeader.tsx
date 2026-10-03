import {useEffect,useRef,useState} from 'react';
import {ChevronDown,Pencil,Settings2} from 'lucide-react';
import {Modal} from '../../components/ui/modal';
import type {ChatWorkspace} from '../../../shared/ipc/contracts';

export function ServerHeader({workspace,onManage,onRename}:{workspace?:ChatWorkspace;onManage:()=>void;onRename:()=>Promise<void>}){
 const [menu,setMenu]=useState(false),[editing,setEditing]=useState(false),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const root=useRef<HTMLElement>(null),trigger=useRef<HTMLButtonElement>(null),saving=useRef(false);
 const wasEditing=useRef(false);
 useEffect(()=>{if(wasEditing.current&&!editing)trigger.current?.focus();wasEditing.current=editing;},[editing]);
 const canRename=workspace?.role==='Owner'||workspace?.role==='Admin';
 useEffect(()=>{
  if(!menu)return;
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setMenu(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMenu(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[menu]);
 async function save(event:React.FormEvent){
  event.preventDefault();if(saving.current||!canRename)return;
  if(!name.trim()||/[\p{Cc}\p{Cf}]/u.test(name)){setError('Informe um nome válido, com até 80 caracteres.');return;}
  saving.current=true;setBusy(true);setError('');
  try{const result=await window.discorda!.chat({kind:'renameWorkspace',name:name.trim()});if(!result.ok)throw Error(result.message);await onRename();setEditing(false);trigger.current?.focus();}
  catch(error){setError(error instanceof Error?error.message:'Não foi possível alterar o nome.');}
  finally{saving.current=false;setBusy(false);}
 }
 return <header className="server-heading" ref={root}>
  <button ref={trigger} className="server-heading-trigger" aria-label="Opções do servidor" aria-expanded={menu} disabled={!workspace} onClick={()=>setMenu(!menu)}><span><small>SEU SERVIDOR</small><strong title={workspace?.name}>{workspace?.name??'Carregando…'}</strong></span><ChevronDown size={17}/></button>
  {menu&&<div className="server-heading-menu"><p>{workspace?.name}</p>{workspace&&workspace.role!=='Member'&&<button onClick={()=>{setMenu(false);onManage();}}><Settings2 size={16}/>Administrar servidor</button>}{canRename&&<button onClick={()=>{setName(workspace?.name??'');setError('');setMenu(false);setEditing(true);}}><Pencil size={16}/>Alterar nome do servidor</button>}{!canRename&&<small>O nome é definido pelos administradores do servidor.</small>}</div>}
  {editing&&<Modal label="Alterar nome do servidor" className="rename-server-dialog" onClose={()=>{if(!saving.current){setEditing(false);trigger.current?.focus();}}}><form onSubmit={event=>void save(event)}><h2>Nome do servidor</h2><p>Este nome aparece para todas as pessoas do grupo.</p><label>Nome<input data-autofocus autoFocus required maxLength={80} value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label><p role="alert">{error}</p><footer><button type="button" disabled={busy} onClick={()=>{setEditing(false);trigger.current?.focus();}}>Cancelar</button><button type="submit" disabled={busy||!name.trim()||name.trim()===workspace?.name}>{busy?'Salvando…':'Salvar nome'}</button></footer></form></Modal>}
 </header>;
}
