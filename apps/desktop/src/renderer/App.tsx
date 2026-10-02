import {useEffect,useRef,useState} from 'react';
import {AudioLines,ArrowRight,Check,RefreshCw,Settings,ShieldCheck,Wifi,X} from 'lucide-react';
import {Button} from './components/ui/button';
import type {AppInfo,ServiceStatus,AuthState} from '../shared/ipc/contracts';
import {AuthPanel} from './features/auth/AuthPanel';
import {UpdateControls,UpdateNotice} from './features/updates/UpdateControls';
import {Chat} from './features/chat/Chat';

export function App(){
  const [auth,setAuth]=useState<AuthState>({status:'signed-out'});
  const [info,setInfo]=useState<AppInfo>();
  const [status,setStatus]=useState<ServiceStatus>();
  const [checking,setChecking]=useState(false),[error,setError]=useState('');
  const [serverIp,setServerIp]=useState(''),[connecting,setConnecting]=useState(false),[connectionMessage,setConnectionMessage]=useState('');
  const settings=useRef<HTMLDialogElement>(null);
  function updateAuth(next:AuthState){setAuth(current=>current.status==='signed-in'&&next.status==='unavailable'?current:next);}
  useEffect(()=>{let active=true;window.discorda?.getAppInfo().then(value=>{if(active)setInfo(value);}).catch(()=>{if(active)setError('Não foi possível consultar o aplicativo. Feche e abra novamente.');});return()=>{active=false;};},[]);
  async function checkConnection(){
    if(!window.discorda||checking)return;setChecking(true);setError('');
    try{setStatus(await window.discorda.checkServices());}catch{setError('Não foi possível verificar a conexão. Tente novamente.');}finally{setChecking(false);}
  }
  useEffect(()=>{if(info?.serverConfigured)void checkConnection();},[info?.serverConfigured]);
  async function connectGroup(){
    if(!window.discorda||connecting)return;setConnecting(true);setConnectionMessage('Verificando conexão segura com o servidor…');
    try{const result=await window.discorda.connectServer(serverIp);setConnectionMessage(result.ok?'Conexão salva. Reiniciando…':result.message??'Não foi possível conectar.');}
    catch{setConnectionMessage('Não foi possível conectar. Confira o IP e tente novamente.');}finally{setConnecting(false);}
  }
  if(auth.status==='signed-in')return <Chat account={<AuthPanel onStateChange={updateAuth}/>}/>;
  const configured=info?.serverConfigured!==false;
  const healthy=status?.api==='online'&&status.database==='ready';
  return <div className="entry-shell">
    <header className="entry-header"><a href="#inicio" className="brand" aria-label="Discorda, início"><span className="brand-icon"><AudioLines size={22}/></span>discorda<span className="brand-dot">.</span></a><div><span className="entry-version">{info?`v${info.version}`:'Desktop'}</span><button className="icon-button" aria-label="Configurações do aplicativo" title="Configurações" onClick={()=>settings.current?.showModal()}><Settings size={19}/></button></div></header>
    <main id="inicio" className="entry-main">
      <section className="entry-intro"><span className="entry-eyebrow">PERTO, MESMO DE LONGE</span><h1>O seu grupo.<br/><span>Logo ali.</span></h1><p>Entre, puxe uma conversa e compartilhe o momento.</p><div className="entry-illustration" aria-hidden="true"><AudioLines size={66}/><span>Uma sala. Seu grupo inteiro.</span><div><i/><i/><i/><i/><i/></div></div><div className="entry-privacy"><ShieldCheck size={17}/><span>Seu servidor. Acesso por convite.</span></div></section>
      <div className="entry-access">
        <ol className="entry-steps" aria-label="Etapas para entrar"><li className={configured?'complete':'active'}>{configured?<Check size={14}/>:<span>1</span>} Conectar ao grupo</li><ArrowRight size={14} aria-hidden="true"/><li className={configured?'active':''}><span>2</span> Entrar com Google</li></ol>
        {!info&&<p role="status" className="entry-loading">Preparando seu espaço…</p>}
        {info?.serverConfigured===false&&<section className="entry-card server-setup"><span className="entry-eyebrow">PRIMEIRO ACESSO</span><h2>Qual é o seu servidor?</h2><p>Peça o domínio ou IP Radmin ao administrador do grupo. A conexão fica salva para as próximas vezes.</p><form onSubmit={event=>{event.preventDefault();void connectGroup();}}><label htmlFor="server-ip">Endereço do servidor</label><input id="server-ip" value={serverIp} onChange={event=>{setServerIp(event.target.value);setConnectionMessage('');}} placeholder="grupo.exemplo.com ou 26.x.x.x" autoComplete="off" maxLength={270} required disabled={connecting}/><small>Use o domínio do grupo. Para servidores Radmin, informe o IP de quem hospeda.</small><Button type="submit" disabled={connecting}>{connecting?<RefreshCw className="animate-spin"/>:<ArrowRight/>}{connecting?'Conectando…':'Conectar ao grupo'}</Button></form><p className="entry-feedback" role="status" aria-live="polite">{connectionMessage}</p><details><summary>Já tenho um arquivo de conexão</summary><Button variant="outline" onClick={()=>void window.discorda?.importServer().catch(()=>setConnectionMessage('Não foi possível importar. Confira o arquivo de conexão.'))}>Importar conexão do grupo</Button></details></section>}
        {info&&configured&&<AuthPanel onStateChange={updateAuth}/>}
        <section className={'entry-connection '+(healthy?'is-online':'')} aria-label="Conexão com os serviços"><Wifi size={18}/><div><strong>{healthy?'Servidor disponível':status?'Servidor indisponível':'Antes de entrar'}</strong><p role="status" aria-live="polite">{error||(checking?'Verificando servidor e banco…':status?`Servidor ${status.api==='online'?'disponível':'indisponível'} · Banco ${status.database==='ready'?'pronto':'ainda não disponível'}`:'Use o endereço informado pelo administrador. No Radmin, conecte-se à rede do grupo.')}</p>{status&&!healthy&&<small>Confira sua conexão e se o servidor do grupo está ligado.</small>}</div><button className="icon-button" disabled={checking} aria-label="Verificar conexão" title="Verificar conexão" onClick={()=>void checkConnection()}><RefreshCw size={17} className={checking?'animate-spin':''}/></button></section>
        <UpdateNotice onOpen={()=>settings.current?.showModal()}/>
      </div>
    </main>
    <footer className="entry-footer"><span>{info?`Desktop · v${info.version}`:'Discorda desktop'}</span><span>Feito para estar junto.</span></footer>
    <dialog ref={settings} className="app-settings" aria-labelledby="app-settings-title"><header><div><h2 id="app-settings-title">Configurações do aplicativo</h2><p>Versão e atualizações.</p></div><button className="icon-button" aria-label="Fechar configurações" onClick={()=>settings.current?.close()}><X size={20}/></button></header><UpdateControls/></dialog>
  </div>;
}
