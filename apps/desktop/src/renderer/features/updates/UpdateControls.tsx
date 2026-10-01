import {useEffect,useState} from 'react';
import {ArrowDownToLine,CheckCircle2,RefreshCw} from 'lucide-react';
import type {UpdateState} from '../../../shared/ipc/contracts';
function useUpdateState(){
 const [state,setState]=useState<UpdateState>({status:'idle'});
 useEffect(()=>{let active=true;const refresh=()=>void window.discorda?.updates('status').then(value=>{if(active)setState(value);}).catch(()=>{});refresh();const timer=setInterval(refresh,4000);return()=>{active=false;clearInterval(timer);};},[]);
 return [state,setState] as const;
}
export function UpdateNotice({onOpen}:{onOpen:()=>void}){
 const [state]=useUpdateState();
 if(state.status!=='ready'&&state.status!=='downloading')return null;
 return <button className="update-notice" onClick={onOpen}><ArrowDownToLine size={16}/><span>{state.status==='ready'?`Versão ${state.version} pronta para instalar`:`Baixando atualização · ${state.progress??0}%`}</span><span>Ver</span></button>;
}
export function UpdateControls(){
 const [state,setState]=useUpdateState(),[error,setError]=useState('');
 const [version,setVersion]=useState('…');
 useEffect(()=>{let active=true;window.discorda?.getAppInfo().then(info=>{if(active)setVersion(info.version);}).catch(()=>{if(active)setVersion('indisponível');});return()=>{active=false;};},[]);
 const busy=state.status==='checking'||state.status==='downloading';
 const message=error||state.message||({idle:'A busca por novas versões é automática.',checking:'Buscando uma nova versão…',current:'Você está na versão mais recente.',downloading:`Baixando atualização: ${state.progress??0}%`,ready:`Versão ${state.version} pronta para instalar.`,error:'Não foi possível verificar. Tente novamente.'}[state.status]);
 return <section className="update-controls" aria-label="Atualizações"><div className="update-heading">{state.status==='current'?<CheckCircle2 size={20}/>:<ArrowDownToLine size={20}/>}<h3>Atualizações</h3></div><p className="installed-version">Versão instalada: <strong>{version}</strong></p><p role="status">{message}</p>{state.status==='downloading'&&<progress aria-label="Download da atualização" max={100} value={state.progress??0}/>}<button disabled={busy} onClick={()=>{setError('');void window.discorda?.updates(state.status==='ready'?'install':'check').then(setState).catch(()=>setError('Saia da chamada e tente novamente.'));}}><RefreshCw size={15} className={state.status==='checking'?'animate-spin':''}/>{state.status==='ready'?'Instalar e reiniciar':'Verificar atualizações'}</button><small>A instalação começa quando você confirmar, fora de uma chamada.</small></section>;
}
