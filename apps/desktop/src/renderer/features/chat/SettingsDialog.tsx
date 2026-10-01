import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Mic,SlidersHorizontal,Download,X,Activity} from 'lucide-react';
export function SettingsDialog({onClose,audio,devices,updates,diagnostics,initialTab='audio'}:{onClose:()=>void;audio:ReactNode;devices:ReactNode;updates:ReactNode;diagnostics?:ReactNode;initialTab?:'audio'|'devices'|'updates'|'diagnostics'}){
 const ref=useRef<HTMLDialogElement>(null);
 const [tab,setTab]=useState(initialTab),[version,setVersion]=useState('…');
 useEffect(()=>{ref.current?.showModal();let active=true;window.discorda?.getAppInfo().then(info=>{if(active)setVersion(info.version);}).catch(()=>{if(active)setVersion('indisponível');});return()=>{active=false;};},[]);
 const entries=[{id:'audio' as const,label:'Voz e microfone',icon:Mic},{id:'devices' as const,label:'Dispositivos',icon:SlidersHorizontal},{id:'updates' as const,label:'Atualizações',icon:Download},{id:'diagnostics' as const,label:'Conexão e diagnóstico',icon:Activity}];
 return <dialog ref={ref} className="settings-dialog" aria-label="Configurações de microfone" onCancel={onClose}>
  <aside className="settings-nav"><h2>Configurações</h2><p>Seu Discorda, do seu jeito.</p><nav aria-label="Seções de configurações">{entries.map(({id,label,icon:Icon})=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}><Icon size={18}/>{label}</button>)}</nav><div className="settings-version"><strong>discorda.</strong><span>Versão instalada: {version}</span></div></aside>
  <div className="settings-body"><header><div><h2>{entries.find(x=>x.id===tab)?.label}</h2><p>{tab==='audio'?'Ajuste sua voz e os sons da chamada.':tab==='devices'?'Escolha seus dispositivos e confira as permissões.':tab==='diagnostics'?'Verifique o servidor, o chat e a chamada.':'Mantenha seu aplicativo atualizado.'}</p></div><button className="icon-button" aria-label="Fechar configurações" onClick={onClose}><X size={21}/></button></header><div className="settings-content">{tab==='audio'?audio:tab==='devices'?devices:tab==='diagnostics'?diagnostics:updates}</div></div>
 </dialog>;
}
