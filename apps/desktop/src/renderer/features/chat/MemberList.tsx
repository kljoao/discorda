import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Search,Users,X,Shield} from 'lucide-react';
import type {PresenceMember,MemberRoleView} from '../../../shared/ipc/contracts';
import {Avatar} from './Avatar';
import {useDialogClose} from '../../components/ui/use-dialog-close';
import './member-list.css';

const preferenceKey='discorda:members-by-role',preferenceEvent='discorda:member-display';
function readGrouping(){try{return localStorage.getItem(preferenceKey)==='true';}catch{return false;}}
export function useMemberGrouping(){
 const [grouped,setGrouped]=useState(readGrouping);
 useEffect(()=>{const sync=()=>setGrouped(readGrouping());window.addEventListener(preferenceEvent,sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener(preferenceEvent,sync);window.removeEventListener('storage',sync);};},[]);
 function change(value:boolean){try{localStorage.setItem(preferenceKey,String(value));}catch{}setGrouped(value);window.dispatchEvent(new Event(preferenceEvent));}
 return [grouped,change] as const;
}
export function MemberDisplaySettings(){const [grouped,change]=useMemberGrouping();return <section className="member-display-settings"><span className="member-display-icon"><Users size={22}/></span><h3>Lista de membros</h3><p>Escolha como organizar as pessoas na lateral da conversa.</p><label><span><strong>Separar membros por cargo</strong><small>Do cargo mais alto ao mais baixo. Cada pessoa aparece uma vez, no seu cargo principal.</small></span><input type="checkbox" role="switch" checked={grouped} onChange={e=>change(e.target.checked)} aria-label="Separar membros por cargo"/></label><p className="member-display-note">A lista continua mostrando apenas quem tem acesso ao canal. Sua escolha fica salva neste computador.</p></section>;}

function sortedRoles(member:PresenceMember){return [...member.roles??[]].sort((a,b)=>b.position-a.position||a.name.localeCompare(b.name,'pt-BR')||a.id.localeCompare(b.id));}
const statusLabel={online:'Disponível',away:'Ausente',offline:'Offline'};
export function MemberList({members,self,hidden,state,retry}:{members:PresenceMember[];self?:string;hidden:boolean;state:'loading'|'ready'|'error';retry:()=>void}){
 const [grouped]=useMemberGrouping(),[query,setQuery]=useState(''),[opened,setOpened]=useState<{id:string;anchor:HTMLElement}>();
 const selected=members.find(m=>m.id===opened?.id);
 useEffect(()=>{if(hidden||!selected)setOpened(undefined);},[hidden,selected?.id]);
 const matching=members.filter(m=>[m.name,m.accountName??'',...m.roles?.map(r=>r.name)??[]].some(text=>text.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))));
 const groups:{id:string;name:string;color?:string;position:number;members:PresenceMember[]}[]=[];
 if(grouped){
  const index=new Map<string,typeof groups[number]>();
  for(const member of matching){const role=sortedRoles(member)[0],id=role?.id??'without-role';let group=index.get(id);if(!group){group={id,name:role?.name??'Sem cargo',color:role?.color,position:role?.position??-1,members:[]};index.set(id,group);}group.members.push(member);}
  groups.push(...[...index.values()].sort((a,b)=>b.position-a.position||a.name.localeCompare(b.name,'pt-BR')||a.id.localeCompare(b.id)));
 }else for(const status of ['online','away','offline'] as const){const entries=matching.filter(m=>m.status===status);if(entries.length||status==='online')groups.push({id:status,name:status==='online'?'Disponíveis':statusLabel[status],position:0,members:entries});}
 const order={online:0,away:1,offline:2};
 return <aside id="members-list" className="members-rail" hidden={hidden} aria-label="Membros disponíveis"><div className="members-heading"><h2>Pessoas do grupo</h2><span>{members.length}</span></div><label className="member-search"><Search size={15}/><input type="search" aria-label="Buscar membros" placeholder="Buscar pessoa ou cargo" maxLength={80} value={query} onChange={e=>setQuery(e.target.value)}/></label>
  {groups.map(group=><section key={group.id} aria-label={group.name}><h2>{group.color&&<i className="member-role-dot" style={{background:group.color}}/>}{group.name} — {group.members.length}</h2>{[...group.members].sort((a,b)=>order[a.status]-order[b.status]||a.name.localeCompare(b.name,'pt-BR')||a.id.localeCompare(b.id)).map(member=><button type="button" className={'member-row member-profile-trigger '+member.status+(opened?.id===member.id?' selected':'')} key={member.id} aria-label={'Ver perfil de '+member.name} aria-haspopup="dialog" aria-expanded={opened?.id===member.id} onClick={e=>setOpened(opened?.id===member.id?undefined:{id:member.id,anchor:e.currentTarget})}><div className="member-photo"><Avatar url={member.avatarUrl} name={member.name}/><span className={'presence-dot '+member.status}/></div><div><strong title={member.name}>{member.name}{member.id===self?' (você)':''}</strong><small>{statusLabel[member.status]}</small></div></button>)}</section>)}
  {query.trim()&&!matching.length&&<p className="members-empty" role="status">Nenhuma pessoa encontrada.</p>}{state==='error'&&<div className="members-empty" role="status">Não foi possível atualizar a lista.<button onClick={retry}>Tentar novamente</button></div>}{!members.length&&state!=='error'&&<p className="members-empty">{state==='loading'?'Carregando membros…':'Nenhum membro para exibir.'}</p>}
  {!hidden&&selected&&opened&&<MemberCard key={selected.id} member={selected} anchor={opened.anchor} close={()=>setOpened(undefined)}/>}
 </aside>;
}

function RoleChip({role}:{role:MemberRoleView}){return <span className="member-role-chip"><i style={{background:role.color}}/>{role.name}</span>;}
function MemberCard({member,anchor,close}:{member:PresenceMember;anchor:HTMLElement;close:()=>void}){
 const ref=useRef<HTMLDivElement>(null),{closing,dismiss}=useDialogClose(close),[position,setPosition]=useState({left:0,top:0});
 const dismissRef=useRef(dismiss);dismissRef.current=dismiss;
 useLayoutEffect(()=>{function place(){const box=anchor.getBoundingClientRect(),card=ref.current!,width=card.offsetWidth,height=card.offsetHeight;setPosition({left:Math.max(12,Math.min(box.left-width-12,innerWidth-width-12)),top:Math.max(12,Math.min(box.top,innerHeight-height-12))});}place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};},[anchor,member.name,member.roles]);
 useEffect(()=>{ref.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();dismissRef.current();}};const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node)&&!anchor.contains(e.target as Node))dismissRef.current();};document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);if(anchor.isConnected)anchor.focus();};},[anchor]);
 return createPortal(<div ref={ref} tabIndex={-1} role="dialog" aria-label={'Perfil de '+member.name} className={'member-profile-card'+(closing?' is-closing':'')} style={position}><div className="member-profile-banner"/><button className="member-profile-close" aria-label="Fechar perfil" onClick={dismiss}><X size={17}/></button><div className="member-profile-body"><div className="member-profile-avatar"><Avatar url={member.avatarUrl} name={member.name}/><span className={'presence-dot '+member.status}/></div><span className="member-profile-status">{statusLabel[member.status]}</span><h2>{member.name}</h2><dl><div><dt>Nome no servidor</dt><dd>{member.name}</dd></div><div><dt>Nome da conta</dt><dd>{member.accountName||'Disponível após o próximo login'}</dd></div></dl><div className="member-profile-roles"><h3><Shield size={13}/>Cargos</h3><div>{sortedRoles(member).map(role=><RoleChip key={role.id} role={role}/>)}{!member.roles?.length&&<span className="member-profile-no-role">@todos · membro da comunidade</span>}</div></div></div></div>,document.body);
}
