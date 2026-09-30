import {useEffect,useState} from 'react';
import type {UpdateState} from '../../../shared/ipc/contracts';
export function UpdateControls(){
  const [state,setState]=useState<UpdateState>({status:'idle'}),[error,setError]=useState('');
  useEffect(()=>{let alive=true;const refresh=()=>void window.discorda?.updates('status').then(s=>{if(alive)setState(s);}).catch(()=>{});refresh();const timer=setInterval(refresh,2000);return()=>{alive=false;clearInterval(timer);};},[]);
  return <section className="update-controls"><h3>Atualizações</h3><p role="status">{error||state.message||({idle:'Busca automática de novas versões.',checking:'Verificando…',current:'Você está na versão mais recente.',downloading:`Baixando atualização: ${state.progress??0}%`,ready:`Versão ${state.version} pronta para instalar.`,error:'Atualização indisponível.'}[state.status])}</p><button disabled={state.status==='checking'||state.status==='downloading'} onClick={()=>{setError('');void window.discorda?.updates(state.status==='ready'?'install':'check').then(setState).catch(()=>setError('Saia da chamada e tente novamente.'));}}>{state.status==='ready'?'Instalar e reiniciar':'Verificar atualizações'}</button><small>A instalação só começa ao clicar, fora de uma chamada.</small></section>;
}
