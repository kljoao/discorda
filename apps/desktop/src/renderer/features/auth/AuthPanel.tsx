import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { AuthState } from '../../../shared/ipc/contracts';

export function AuthPanel({ onStateChange }: { onStateChange?: (state: AuthState) => void }) {
  const [state, setState] = useState<AuthState>({ status: 'signed-out' });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [profileError, setProfileError] = useState('');
  const revision = useRef(0);
  function update(value: AuthState) { setState(previous => previous.status === 'signed-in' && value.status === 'unavailable' ? previous : value); onStateChange?.(value); }
  useEffect(() => {
    let active = true;
    const check = () => {
      const current = revision.current;
      window.discorda?.getAuthState().then(value => { if (active && current === revision.current) update(value); })
        .catch(() => { if (active && current === revision.current) update({ status: 'unavailable', message: 'Não foi possível verificar sua sessão.' }); });
    };
    check();
    const timer = setInterval(check, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  async function run(action: 'signIn' | 'signOut' | 'getAuthState') {
    if (!window.discorda || busy) return;
    revision.current++;
    setBusy(true);
    if (action === 'signIn') setState({ status: 'signing-in' });
    try { update(await window.discorda[action]()); }
    catch { update({ status: 'unavailable', message: 'Não foi possível completar a operação.' }); }
    finally { setBusy(false); }
  }
  async function saveName(event: React.FormEvent) {
    event.preventDefault(); if (!window.discorda || busy || state.status !== 'signed-in') return;
    setBusy(true); setProfileError(''); revision.current++;
    try {
      const result = await window.discorda.chat({kind:'profile',displayName:name.trim()});
      if (!result.ok) { setProfileError(result.message); return; }
      update({status:'signed-in',profile:result.data as import('../../../shared/ipc/contracts').MemberProfile}); setEditing(false);
    } catch { setProfileError('Não foi possível salvar seu nome.'); }
    finally { setBusy(false); }
  }

  return <section className="connection-panel auth-panel" aria-label="Sua conta" data-state={state.status}>
    <div className="connection-icon"><LogIn size={22} /></div>
    <div className="connection-copy">
      <h3>{state.status === 'signed-in' ? `Bom te ver, ${state.profile.displayName}.` : state.status === 'signing-in' ? 'Continue no navegador' : state.status === 'unavailable' ? 'Vamos restabelecer a conexão' : 'Entre no seu grupo'}</h3>
      <p role="status" aria-live="polite">{state.status === 'signed-in' ? `${state.profile.email} · Acesso ao grupo autorizado` : state.status === 'signing-in' ? 'Conclua o login no navegador e volte para cá.' : state.message || 'Entre com Google usando uma conta autorizada pelo grupo.'}</p>
      {editing && <form className="profile-form" onSubmit={saveName}><label>Nome no Discorda<input autoFocus aria-label="Nome no Discorda" maxLength={32} value={name} onChange={e=>setName(e.target.value)}/></label><button disabled={busy || !name.trim()}>Salvar nome</button><button type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancelar</button>{profileError && <span role="alert">{profileError}</span>}</form>}
    </div>
    {state.status === 'signed-in' ? <><Button variant="outline" disabled={busy} onClick={()=>{setName(state.profile.displayName);setEditing(!editing);setProfileError('');}}>Editar nome</Button><Button variant="outline" disabled={busy} onClick={() => void run('signOut')}><LogOut />Sair</Button></>
      : state.status === 'signing-in' ? <><LoaderCircle className="animate-spin" size={18} /><Button variant="outline" onClick={() => void window.discorda?.cancelSignIn()}>Cancelar</Button></>
      : <><Button disabled={busy || !window.discorda} onClick={() => void run('signIn')}><LogIn />Entrar com Google</Button>{state.status === 'unavailable' && <Button variant="outline" disabled={busy} onClick={() => void run('getAuthState')} aria-label="Verificar sessão"><RefreshCw /></Button>}</>}
  </section>;
}
