import { useEffect, useState } from 'react';
import { ArrowUpRight, AudioLines, Check, Headphones, LockKeyhole, MessageCircle, MonitorUp, RefreshCw, ShieldCheck, Waves } from 'lucide-react';
import { Button } from './components/ui/button';
import type { AppInfo, ServiceStatus } from '../shared/ipc/contracts';
import { AuthPanel } from './features/auth/AuthPanel';
import {UpdateControls} from './features/updates/UpdateControls';
import { Chat } from './features/chat/Chat';
import type { AuthState } from '../shared/ipc/contracts';

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'signed-out' });
  function updateAuth(next: AuthState) { setAuth(current => current.status === 'signed-in' && next.status === 'unavailable' ? current : next); }
  const [info, setInfo] = useState<AppInfo>();
  const [status, setStatus] = useState<ServiceStatus>();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    window.discorda?.getAppInfo().then((value) => { if (active) setInfo(value); }).catch(() => {
      if (active) setError('Não foi possível consultar o aplicativo.');
    });
    return () => { active = false; };
  }, []);

  async function checkConnection() {
    if (!window.discorda || checking) return;
    setChecking(true);
    setError('');
    try { setStatus(await window.discorda.checkServices()); }
    catch { setError('Não foi possível verificar a conexão. Tente novamente.'); }
    finally { setChecking(false); }
  }

  if (auth.status === 'signed-in') return <Chat account={<AuthPanel onStateChange={updateAuth} />} />;
  return <div className="app-shell">
    <aside className="sidebar">
      <a href="#inicio" className="brand" aria-label="Discorda, início"><span className="brand-icon"><AudioLines size={23} /></span>discorda<span className="brand-dot">.</span></a>
      <p className="sidebar-label">SEU ESPAÇO</p>
      <div className="nav-active"><Waves size={18} /> Boas-vindas <span className="nav-dot" /></div>
      <div className="sidebar-note"><LockKeyhole size={17} /><p>Um lugar só para<br /><strong>quem faz parte.</strong></p></div>
      <div className="sidebar-bottom"><span className="avatar"><Headphones size={20} /></span><div><strong>Seu próximo encontro</strong><small>Começa por aqui</small></div></div>
    </aside>
    <main id="inicio">
      <header><span>Feito para estar junto</span><span className="phase-badge"><span /> PRÉVIA · 0.3</span></header>
      <section className="welcome">
        <div className="eyebrow"><span className="line" /> MENOS RUÍDO. MAIS CONVERSA.</div>
        <h1>O seu grupo.<br />O seu <span>lugar.</span></h1>
        <p className="intro">A conversa depois da partida. A música nova.<br />Aquela companhia, mesmo de longe.</p>
        <div className="welcome-bottom"><span className="mini-wave"><AudioLines size={20} /></span><span>Privado por escolha. Próximo por natureza.</span></div>
        <div className="orbit" aria-hidden="true"><div className="orbit-inner"><AudioLines strokeWidth={1.3} /></div><span className="orbit-mark one"><MessageCircle /></span><span className="orbit-mark two"><Headphones /></span><span className="orbit-mark three"><MonitorUp /></span></div>
      </section>
      {info?.serverConfigured===false&&<section className="getting-started"><h2>Conectar ao seu grupo</h2><p>Importe o arquivo de conexão enviado pelo dono do grupo.</p><Button onClick={()=>void window.discorda?.importServer().catch(()=>setError('Não foi possível importar. Confira o arquivo de conexão.'))}>Importar conexão do grupo</Button></section>}
      <AuthPanel onStateChange={updateAuth} /><UpdateControls/>
      <section className="getting-started" aria-labelledby="start-title">
        <div className="section-title"><div><span className="eyebrow">TUDO NO MESMO LUGAR</span><h2 id="start-title">Seu grupo já pode se encontrar.</h2></div><span className="step-count">03 / 03</span></div>
        <div className="feature-grid">
          <article className="feature-card current"><span className="card-number">01 <Check size={15} /></span><ShieldCheck className="feature-icon" /><h3>Um começo seguro</h3><p>Entre com sua conta e encontre o grupo no seu espaço privado.</p><span className="card-label">ACESSO PROTEGIDO</span></article>
          <article className="feature-card"><span className="card-number">02</span><LockKeyhole className="feature-icon" /><h3>Só os seus amigos</h3><p>Login com Google e entrada por convite. Seu grupo continua sendo seu.</p><span className="card-label muted">LOGIN DISPONÍVEL</span></article>
          <article className="feature-card"><span className="card-number">03</span><MessageCircle className="feature-icon" /><h3>Conversa que aproxima</h3><p>Canais, voz, câmera e tela para compartilhar os pequenos e grandes momentos.</p><span className="card-label muted">TEXTO, VOZ E VÍDEO</span></article>
        </div>
      </section>
      <section className="connection-panel" aria-label="Conexão com os serviços">
        <div className="connection-icon"><Waves size={22} /></div><div className="connection-copy"><h3>Vamos conferir a conexão?</h3><p role="status" aria-live="polite">{error || (checking ? 'Verificando os serviços…' : status ? `Servidor ${status.api === 'online' ? 'disponível' : 'indisponível'} · Banco ${status.database === 'ready' ? 'pronto' : 'ainda não disponível'}` : 'Verifique se os serviços estão disponíveis para este aplicativo.')}</p></div>
        <Button variant="outline" disabled={checking || !window.discorda} onClick={checkConnection}><RefreshCw className={checking ? 'animate-spin' : ''} />{checking ? 'Verificando' : 'Verificar conexão'}</Button>
      </section>
      <footer><span><span className="footer-dot" /> {info ? `Desktop · v${info.version}` : 'Prévia da interface'}</span><span>Construído para o nosso grupo <ArrowUpRight size={13} /></span></footer>
    </main>
  </div>;
}

