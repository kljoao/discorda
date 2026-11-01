import {MemberDisplaySettings} from './MemberList';
import {StreamPrivacy} from './StreamPrivacy';
import {Accessibility} from '../Accessibility';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Mic,SlidersHorizontal,Download,X,Activity,Eye,UserRound,AudioLines,ChevronRight,Check,ShieldCheck,Keyboard,Headphones} from 'lucide-react';
import {useDialogClose} from '../../components/ui/use-dialog-close';
import './settings-dialog.css';
type Tab='appearance'|'audio'|'devices'|'updates'|'diagnostics'|'accessibility'|'account';
const sections=[
 {id:'account' as const,label:'Minha conta',icon:UserRound,group:'SEU ESPAÇO',description:'Um perfil com a sua cara. Cuide de como você aparece para o grupo.',hint:'Perfil e acesso',title:'Você, por aqui.'},
 {id:'appearance' as const,label:'Aparência',icon:Eye,group:'SEU ESPAÇO',description:'Organize sua comunidade do jeito que faz sentido para você.',hint:'Membros e organização',title:'Cada pessoa no seu lugar.'},
 {id:'accessibility' as const,label:'Acessibilidade',icon:Eye,group:'SEU ESPAÇO',description:'Encontre o equilíbrio ideal entre leitura, contraste e movimento.',hint:'Conforto e privacidade',title:'Conforto em cada detalhe.'},
 {id:'audio' as const,label:'Voz e microfone',icon:Mic,group:'SUA EXPERIÊNCIA',description:'Sua voz em primeiro plano. Ajuste a entrada, os filtros e os sons da chamada.',hint:'Áudio, filtros e atalhos',title:'Deixe a conversa fluir.'},
 {id:'devices' as const,label:'Dispositivos',icon:SlidersHorizontal,group:'SUA EXPERIÊNCIA',description:'Escolha de onde sua voz vem, por onde o som sai e como você aparece.',hint:'Microfone, fones e câmera',title:'Tudo conectado a você.'},
 {id:'updates' as const,label:'Atualizações',icon:Download,group:'APLICATIVO',description:'Novidades e melhorias, sempre por perto. Acompanhe sua versão do Discorda.',hint:'Versão e novidades',title:'Pronto para o que vem.'},
 {id:'diagnostics' as const,label:'Conexão e diagnóstico',icon:Activity,group:'APLICATIVO',description:'Confira suas conexões e encontre o caminho para uma chamada tranquila.',hint:'Conexão e ajuda',title:'Tudo no ritmo certo.'},
];
export function SettingsDialog({onClose,audio,devices,updates,diagnostics,account,initialTab='audio'}:{onClose:()=>void;audio:ReactNode;devices:ReactNode;updates:ReactNode;diagnostics?:ReactNode;account?:ReactNode;initialTab?:Tab}){
 const ref=useRef<HTMLDialogElement>(null),content=useRef<HTMLDivElement>(null);
 const {closing,dismiss}=useDialogClose(onClose);
 const [tab,setTab]=useState<Tab>(initialTab),[version,setVersion]=useState('…');
 useEffect(()=>{const previous=document.activeElement;const dialog=ref.current;dialog?.showModal();let active=true;window.discorda?.getAppInfo().then(info=>{if(active)setVersion(info.version);}).catch(()=>{if(active)setVersion('indisponível');});return()=>{active=false;dialog?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 const entries=sections.filter(entry=>entry.id!=='account'||account),selected=entries.find(entry=>entry.id===tab)??entries[0],Icon=selected.icon;
 function change(next:Tab){setTab(next);content.current?.scrollTo({top:0});}
 return <dialog ref={ref} className={'settings-dialog reworked-settings'+(closing?' is-closing':'')} aria-label="Configurações" onCancel={event=>{event.preventDefault();dismiss();}}>
  <aside className="settings-nav"><div className="settings-brand"><span><AudioLines size={23}/></span><div><strong>discorda<span>.</span></strong><small>SEU PAINEL PESSOAL</small></div></div>
   <nav role="tablist" aria-orientation="vertical" aria-label="Seções de configurações">{entries.map(({id,label,icon:EntryIcon,group,hint},index)=><div key={id}>{(index===0||entries[index-1].group!==group)&&<p className="settings-group-label">{group}</p>}<button role="tab" aria-label={label} id={`settings-tab-${id}`} aria-controls="settings-panel" aria-selected={tab===id} tabIndex={tab===id?0:-1} onKeyDown={event=>{const next=event.key==='Home'?0:event.key==='End'?entries.length-1:event.key==='ArrowDown'?(index+1)%entries.length:event.key==='ArrowUp'?(index-1+entries.length)%entries.length:-1;if(next<0)return;event.preventDefault();change(entries[next].id);document.getElementById(`settings-tab-${entries[next].id}`)?.focus();}} onClick={()=>change(id)}><span className="settings-nav-icon"><EntryIcon size={18}/></span><span><strong>{label}</strong><small>{hint}</small></span>{tab===id&&<ChevronRight size={15}/>}</button></div>)}</nav>
   <div className="settings-version"><div><span className="settings-version-dot"/><strong>Feito para estar perto.</strong></div><span>Discorda para Windows · {version}</span><small>Seu grupo, no mesmo lugar.</small></div>
  </aside>
  <div className="settings-body"><header><div className="settings-breadcrumb">Configurações<ChevronRight size={13}/><strong>{selected.label}</strong></div><button className="settings-close" aria-label="Fechar configurações" onClick={dismiss}><X size={19}/><kbd>ESC</kbd></button></header>
   <div className="settings-content" ref={content} key={tab} id="settings-panel" role="tabpanel" tabIndex={0} aria-labelledby={`settings-tab-${tab}`}>
    <div className="settings-page-heading"><span className="settings-page-icon"><Icon size={25}/></span><div><span className="eyebrow">{selected.group}</span><h2>{selected.label}</h2></div></div>
    <div className="settings-hero"><div><h3>{selected.title}</h3><p>{selected.description}</p></div><span aria-hidden="true"><Icon size={60} strokeWidth={1}/></span></div>
    <div className="settings-section-caption"><span>{tab==='appearance'?'PESSOAS E ORGANIZAÇÃO':tab==='audio'?'SUA VOZ, DO SEU JEITO':tab==='devices'?'ESCOLHA SEUS DISPOSITIVOS':tab==='accessibility'?'UMA EXPERIÊNCIA MAIS SUA':tab==='account'?'PERFIL E SEGURANÇA':tab==='updates'?'MANTENHA TUDO EM DIA':'CUIDE DA SUA CONEXÃO'}</span>{!['updates','diagnostics','account'].includes(tab)&&<small><Check size={13}/> Preferências salvas ao alterar</small>}</div>
    <div className="settings-panels">{tab==='appearance'?<MemberDisplaySettings/>:tab==='account'?account:tab==='accessibility'?<><Accessibility/><div className="settings-reading-preview"><span className="settings-preview-avatar">D</span><div><strong>Seu grupo <small>Hoje, 14:32</small></strong><p>Uma boa conversa começa com uma leitura confortável. ✨</p></div></div><StreamPrivacy/></>:tab==='audio'?audio:tab==='devices'?devices:tab==='diagnostics'?diagnostics:updates}</div>
    <div className="settings-bottom-note">{tab==='audio'?<><Headphones size={15}/><span>Use fones durante os testes para ouvir sua voz com mais clareza.</span></>:tab==='account'||tab==='accessibility'||tab==='appearance'?<><ShieldCheck size={15}/><span>Suas preferências de aparência e privacidade ficam neste computador.</span></>:<><Keyboard size={15}/><span>Navegue com Tab. Use Esc para voltar à conversa.</span></>}</div>
   </div>
  </div>
 </dialog>;
}
