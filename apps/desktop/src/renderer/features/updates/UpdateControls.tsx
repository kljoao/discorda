import {prepareUpdate} from '../../lib/update-checkpoint';
import {useEffect,useRef,useState} from 'react';
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
 const [state,setState]=useUpdateState(),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const working=useRef(false);
 async function update(){
  if(working.current)return;working.current=true;setError('');setPending(true);
  try{if(state.status==='ready')prepareUpdate();const next=await window.discorda!.updates(state.status==='ready'?'install':'check');setState(next);}
  catch(error){try{setState(await window.discorda!.updates('status'));}catch{}setError(error instanceof Error?error.message:'Não foi possível atualizar. Tente novamente.');}
  finally{working.current=false;setPending(false);}
 }
 const [version,setVersion]=useState('…');
 useEffect(()=>{let active=true;window.discorda?.getAppInfo().then(info=>{if(active)setVersion(info.version);}).catch(()=>{if(active)setVersion('indisponível');});return()=>{active=false;};},[]);
 const busy=pending||state.status==='installing'||state.status==='checking'||state.status==='downloading';
 const message=error||(pending&&state.status==='ready'?'Preparando atualização…':state.message)||({installing:'Aplicando atualização… o Discorda será reaberto automaticamente.',idle:'A busca por novas versões é automática.',checking:'Buscando uma nova versão…',current:'Você está na versão mais recente.',downloading:`Baixando atualização: ${state.progress??0}%`,ready:`Versão ${state.version} pronta para instalar.`,error:'Não foi possível verificar. Tente novamente.'}[state.status]);
 return <section className="update-controls" aria-label="Atualizações"><div className="update-heading">{state.status==='current'?<CheckCircle2 size={20}/>:<ArrowDownToLine size={20}/>}<h3>Atualizações</h3></div><label className="update-channel">Canal de atualizações<select aria-label="Canal de atualizações" disabled={busy||state.status==='ready'} value={state.channel??'stable'} onChange={e=>{const channel=e.target.value as 'stable'|'beta';if(channel==='beta'&&!window.confirm('Receber versões de teste? Elas podem conter falhas. Não há retorno automático para uma versão anterior.'))return;void window.discorda?.updates(channel).then(setState).catch(()=>setError('Não foi possível trocar o canal agora.'));}}><option value="stable">Estável · recomendado</option><option value="beta">Beta · versões de teste</option></select></label><p>O canal beta é opcional. Todas as atualizações continuam exigindo assinatura válida; voltar ao estável aguarda uma versão mais nova.</p><p className="installed-version">Versão instalada: <strong>{version}</strong></p>{state.startupNotice&&<p role="status">{state.startupNotice}</p>}<p role="status">{message}</p>{state.status==='downloading'&&<progress aria-label="Download da atualização" max={100} value={state.progress??0}/>}<button disabled={busy} onClick={()=>void update()}><RefreshCw size={15} className={state.status==='checking'||state.status==='installing'||pending?'animate-spin':''}/>{state.status==='installing'||pending&&state.status==='ready'?'Atualizando…':state.status==='ready'?'Atualizar e reiniciar':'Verificar atualizações'}</button><small>Ao atualizar, o Discorda salva sua conversa, aplica a instalação em silêncio e reabre automaticamente. Saia da chamada antes de atualizar.</small><details className="update-recovery"><summary>Se uma atualização falhar</summary><p>Reabra o Discorda e confira a versão instalada. Se não abrir, execute novamente o instalador oficial da mesma versão ou de uma versão mais nova. Suas conexões ficam no perfil do Windows; não exclua essa pasta.</p><p>Uma reversão de código deve ser distribuída pelo mantenedor com número de versão maior e assinatura válida. O aplicativo não instala versões antigas automaticamente.</p></details></section>;
}
