import {useChatAttention} from './attention';
import {AdminPanel} from './AdminPanel';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Avatar } from './Avatar';
import { Voice } from './Voice';
import { Hash, MessageCircle, Plus, Send, Reply, Pencil, Trash2, X, Smile } from 'lucide-react';
import type { ChatAction, ChatMessage, ChatWorkspace, PresenceMember, LiveEvent } from '../../../shared/ipc/contracts';

async function request<T>(action: ChatAction): Promise<T> {
  if (!window.discorda) throw new Error('Abra o aplicativo desktop para acessar o grupo.');
  const result = await window.discorda.chat(action);
  if (!result.ok) throw new Error(result.message);
  return result.data as T;
}
export function mergeMessages(previous: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(previous.map(message => [message.id, message]));
  for (const message of incoming) if ((map.get(message.id)?.version ?? 0) <= message.version) map.set(message.id, message);
  return [...map.values()].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir.';

export function Chat({ account }: { account: ReactNode }) {
  const [showMedia,setShowMedia]=useState(false);
  const [mediaHost,setMediaHost]=useState<HTMLDivElement|null>(null);
  const [dockHost,setDockHost]=useState<HTMLDivElement|null>(null);
  const [voiceChannel,setVoiceChannel]=useState<string>();
  const [workspace, setWorkspace] = useState<ChatWorkspace>();
  const attention=useChatAttention(workspace);
  const [adminOpen,setAdminOpen]=useState(false);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [newChannel, setNewChannel] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [membersState,setMembersState]=useState<'loading'|'ready'|'error'>('loading');
  const membersRevision=useRef(0);
  const [presence, setPresence] = useState<PresenceMember[]>([]);
  const [connection, setConnection] = useState<'connected' | 'reconnecting' | 'offline'>('reconnecting');
  const drafts = useRef(new Map<string, string>());
  const pendingSends = useRef(new Map<string, Extract<ChatAction, { kind: 'send' }>>());
  const mounted = useRef(false);
  async function loadMembers(){
    const revision=++membersRevision.current;
    try{
      const members=await Promise.race([request<PresenceMember[]>({kind:'members'}),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Timeout')),10000))]);
      if(!Array.isArray(members))throw new Error('Invalid members');
      if(mounted.current&&revision===membersRevision.current){setPresence(members);setMembersState('ready');}
    }catch{if(mounted.current&&revision===membersRevision.current)setMembersState('error');}
  }
  useEffect(()=>{if(!workspace)return;void loadMembers();const timer=setInterval(()=>void loadMembers(),15000);return()=>{clearInterval(timer);membersRevision.current++;};},[workspace?.id]);
  async function load(start = true) {
    try { const data = await request<ChatWorkspace>({ kind: 'workspace' }); if (!mounted.current) return; setWorkspace(data); setSelected(current => current ?? data.channels[0]?.id); setError(''); if (start) await window.discorda?.startLive(); }
    catch (e) { if (mounted.current) setError(errorMessage(e)); }
  }
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const online=()=>{void window.discorda?.reconnectLive();void loadMembers();};
    window.addEventListener('online',online);
    const off = window.discorda?.onLiveEvent(event => {
      if (!active) return;
      if (event.kind === 'presence') {membersRevision.current++;setPresence(event.data);setMembersState('ready');}
      // REST polling owns roster availability even while the live transport reconnects.
      if (event.kind === 'connection') { setConnection(event.data); if (event.data === 'connected') {void load(false);} }
      if (event.kind === 'channels') void load();
    });
    void load();
    return () => { active = false; window.removeEventListener('online',online);mounted.current = false; off?.(); void window.discorda?.stopLive(); };
  }, []);
  async function createChannel(event: React.FormEvent) {
    event.preventDefault(); if (creating || !name.trim()) return; setCreating(true);
    try { const channel = await request<{ id: string }>({ kind: 'channel', name }); await load(); setSelected(channel.id); setName(''); setNewChannel(false); }
    catch (e) { setError(errorMessage(e)); } finally { setCreating(false); }
  }
  const channel = workspace?.channels.find(c => c.id === selected);
  return <div className="chat-shell">
    <aside className="chat-sidebar"><div className="sidebar-scroll"><div className="brand"><MessageCircle /> discorda<span className="brand-dot">.</span></div>
      {workspace?.isAdmin&&<button className="admin-entry" onClick={()=>setAdminOpen(true)}>Administrar servidor</button>}{adminOpen&&<AdminPanel close={()=>setAdminOpen(false)}/>}<label className="notification-setting"><input type="checkbox" checked={attention.notifications} onChange={attention.toggleNotifications}/> Notificações do Windows</label><h2>{workspace?.name ?? 'Seu grupo'}</h2><div className="chat-channel-label">CANAIS DE TEXTO{workspace?.isAdmin && <button onClick={() => setNewChannel(!newChannel)} aria-label="Criar canal"><Plus size={16} /></button>}</div>
      {newChannel && <form className="channel-form" onSubmit={createChannel}><input autoFocus aria-label="Nome do canal" value={name} maxLength={80} onChange={e => setName(e.target.value)} /><button disabled={creating || !name.trim()}>Criar</button></form>}
      <nav aria-label="Canais">{workspace?.channels.map(item => <button key={item.id} className={selected === item.id ? 'selected' : ''} aria-current={selected === item.id ? 'page' : undefined} onClick={() => {setSelected(item.id);setShowMedia(false);}}><Hash size={18} />{item.name}{attention.unread(item.id)&&<span className="unread-dot" aria-label="Mensagens não lidas">●</span>}</button>)}</nav>
      <Voice presence={presence} channels={workspace?.voiceChannels ?? []} userId={workspace?.userId} mediaHost={mediaHost} dockHost={dockHost} open={showMedia} setOpen={setShowMedia} onChannel={setVoiceChannel} self={presence.find(p=>p.id===workspace?.userId)}/>

      </div><div ref={setDockHost} className="sidebar-footer"/>
    </aside>
    <main className="chat-main"><div className="chat-account">{account}</div><div className={`live-status ${connection}`} role="status">{connection === 'connected' ? 'Conectado em tempo real' : connection === 'reconnecting' ? 'Reconectando… seu rascunho continua aqui.' : 'Tempo real indisponível. Tentando reconectar…'}{connection!=='connected'&&<button onClick={()=>void window.discorda?.reconnectLive()}>Reconectar chat</button>}</div>
      {error && <div className="chat-error" role="alert">{error} <button onClick={() => void load()}>Tentar novamente</button></div>}
      {voiceChannel&&<nav className="content-tabs" aria-label="Visualização"><button aria-pressed={!showMedia} onClick={()=>setShowMedia(false)}>Chat</button><button aria-pressed={showMedia} onClick={()=>setShowMedia(true)}>Chamada · {voiceChannel}</button></nav>}
      <div ref={setMediaHost} className="call-stage" hidden={!showMedia}/>
      <div className="text-stage" hidden={showMedia}>{workspace && channel ? <Conversation visible={!showMedia} muted={attention.muted.includes(channel.id)} toggleMuted={()=>attention.toggleMuted(channel.id)} onRead={id=>attention.markRead(channel.id,id)} key={channel.id} channel={channel} userId={workspace.userId} drafts={drafts.current} pendingSends={pendingSends.current} presence={presence} /> : <div className="chat-empty">{error ? 'O grupo ainda não está disponível.' : 'Carregando seu grupo…'}</div>}</div>
    </main>
    <aside className="members-rail" aria-label="Membros disponíveis">
      {(['online','away','offline'] as const).map(status=>{
        const members=presence.filter(member=>member.status===status);
        const label=status==='online'?'Disponíveis':status==='away'?'Ausentes':'Offline';
        return (members.length>0||status==='online')&&<section key={status} aria-label={label}>
          <h2>{label} — {members.length}</h2>
          {members.map(member=><div className={'member-row '+status} key={member.id}>
            <div className="member-photo"><Avatar url={member.avatarUrl} name={member.name}/><span className={'presence-dot '+status}/></div>
            <div><strong title={member.name}>{member.name}{member.id===workspace?.userId?' (você)':''}</strong><small>{status==='online'?'Disponível':status==='away'?'Ausente':'Offline'}</small></div>
          </div>)}
        </section>;
      })}
      {membersState==='error'&&<div className="members-empty" role="status">Não foi possível atualizar a lista.<button onClick={()=>{setMembersState('loading');void loadMembers();}}>Tentar novamente</button></div>}{!presence.length&&membersState!=='error'&&<p className="members-empty">{membersState==='loading'?'Carregando membros…':'Nenhum membro para exibir.'}</p>}
    </aside>
  </div>;
}

function Conversation({ channel, userId, drafts, pendingSends, presence,visible,muted,toggleMuted,onRead }: {visible:boolean;muted:boolean;toggleMuted:()=>void;onRead:(id:string)=>void; channel: { id: string; name: string }; userId: string; drafts: Map<string, string>; pendingSends: Map<string, Extract<ChatAction, { kind: 'send' }>>; presence: PresenceMember[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const composer=useRef<HTMLTextAreaElement>(null);
  const [emojis,setEmojis]=useState(false);
  const [draft, setDraft] = useState(drafts.get(channel.id) ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<ChatMessage>();
  const [edit, setEdit] = useState<ChatMessage>();
  const [removing, setRemoving] = useState<string>();
  const [pending, setPending] = useState<Extract<ChatAction, {kind: 'send'}> | undefined>(pendingSends.get(channel.id));
  const alive = useRef(true);
  const list = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [atBottom,setAtBottom]=useState(true);
  const readCallback=useRef(onRead);readCallback.current=onRead;
  const visibleRef=useRef(visible);visibleRef.current=visible;
  const fetching = useRef(false);
  const initialLoaded = useRef(false);
  const currentMessages = useRef(messages); currentMessages.current = messages;
  const needsSync = useRef(false);
  async function history(before?: string) {
    if (fetching.current) return; fetching.current = true;
    try {
      const page = await request<{items: ChatMessage[]; hasMore: boolean}>({kind: 'history', channelId: channel.id, before});
      if (!alive.current) return;
      setMessages(current => mergeMessages(current, page.items));
      if (before || !initialLoaded.current) setHasMore(page.hasMore);
      initialLoaded.current = true;
      setError('');
    } catch (e) { if (alive.current) setError(errorMessage(e)); }
    finally { fetching.current = false; if (alive.current) { setLoading(false); setOlderBusy(false); if (needsSync.current) { needsSync.current = false; void synchronize(); } } }
  }
  async function synchronize() {
    if (fetching.current) { needsSync.current = true; return; }
    fetching.current = true;
    const oldest = currentMessages.current[0]?.id;
    let before: string | undefined;
    try {
      // Re-read all loaded history, including edits/deletions and gaps larger than one page.
      for (;;) {
        const page = await request<{items: ChatMessage[]; hasMore: boolean}>({kind: 'history', channelId: channel.id, before});
        if (!alive.current) return;
        setMessages(current => mergeMessages(current, page.items));
        const first = page.items[0]?.id;
        if (!oldest || !first || BigInt(first) <= BigInt(oldest) || !page.hasMore) {
          if (!initialLoaded.current) setHasMore(page.hasMore);
          break;
        }
        before = first;
        // Avoid bursts against the shared request limit for very long loaded histories.
        await new Promise(resolve => setTimeout(resolve, 600));
        if (!alive.current) return;
      }
      initialLoaded.current = true; setError('');
    } catch (e) { if (alive.current) setError(errorMessage(e)); }
    finally { fetching.current = false; if (alive.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true;
    const off = window.discorda?.onLiveEvent((event: LiveEvent) => {
      if (!alive.current) return;
      if (event.kind === 'profile') setMessages(current => current.map(m => m.authorId === event.data.userId ? {...m, authorName:event.data.displayName} : m));
      if (event.kind === 'message' && event.data.channelId === channel.id) setMessages(current => mergeMessages(current, [event.data]));
      if (event.kind === 'connection' && event.data === 'connected') void synchronize();
    });
    void history(); void window.discorda?.liveActivity(channel.id, false);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void synchronize(); }, 60000);
    return () => { alive.current = false; off?.(); clearInterval(timer); void window.discorda?.liveActivity(channel.id, false); };
  }, []);
  useEffect(() => { if (nearBottom.current) list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages]);
  useEffect(()=>{const mark=()=>{const last=currentMessages.current.at(-1);if(last&&visibleRef.current&&nearBottom.current&&document.visibilityState==='visible'&&document.hasFocus())readCallback.current(last.id);};mark();window.addEventListener('focus',mark);document.addEventListener('visibilitychange',mark);return()=>{window.removeEventListener('focus',mark);document.removeEventListener('visibilitychange',mark);};},[messages,visible,atBottom]);
  function changeDraft(value: string) { setDraft(value); drafts.set(channel.id, value); void window.discorda?.liveActivity(channel.id, value.trim().length > 0); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || !draft.trim()) return; setBusy(true); setError('');
    const action: ChatAction = edit ? { kind: 'edit', channelId: channel.id, id: edit.id, version: edit.version, body: draft }
      : pending ?? { kind: 'send', channelId: channel.id, clientId: crypto.randomUUID(), body: draft, replyToId: reply?.id };
    if (action.kind === 'send') { setPending(action); pendingSends.set(channel.id, action); }
    try {
      const saved = await request<ChatMessage>(action);
      drafts.delete(channel.id); pendingSends.delete(channel.id);
      if (!alive.current) return;
      nearBottom.current = true; setMessages(current => mergeMessages(current, [saved])); changeDraft(''); setEdit(undefined); setReply(undefined); setPending(undefined);
    } catch (e) { if (alive.current) setError(errorMessage(e)); }
    finally { if (alive.current) {setBusy(false);requestAnimationFrame(()=>composer.current?.focus());} }
  }
  async function remove(message: ChatMessage) {
    if (busy) return; setBusy(true);
    try { const saved = await request<ChatMessage>({kind: 'delete', channelId: channel.id, id: message.id, version: message.version}); if (alive.current) { setMessages(current => mergeMessages(current, [saved])); setRemoving(undefined); } }
    catch (e) { if (alive.current) setError(errorMessage(e)); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="conversation" aria-label={`Canal ${channel.name}`}>
    <div className="chat-heading"><Hash /><h1>{channel.name}</h1><button className="mute-channel" aria-pressed={muted} onClick={toggleMuted}>{muted?'Ativar avisos deste canal':'Silenciar este canal'}</button></div>
    <div className="message-list" ref={list} onScroll={() => { const node = list.current!; nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;setAtBottom(nearBottom.current); }}>
      {hasMore && <button className="older-button" disabled={olderBusy || loading} onClick={() => { nearBottom.current = false; setOlderBusy(true); void history(messages[0]?.id); }}>Carregar anteriores</button>}
      {messages.length === 0 && <div className="chat-empty"><Hash size={42} /><h2>Bem-vindo a #{channel.name}</h2><p>{loading ? 'Carregando mensagens…' : 'A conversa começa com a primeira mensagem.'}</p></div>}
      {messages.map(message => <article className="chat-message" key={message.id} aria-label={`Mensagem de ${message.authorName}`}>
        <div className="message-avatar">{message.authorName.slice(0, 1).toUpperCase()}</div><div className="message-content">
          <div className="message-meta"><strong>{message.authorName}</strong><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString('pt-BR')}>{new Date(message.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</time>{message.editedAt && !message.deletedAt && <small>editada</small>}</div>
          {message.replyToId && <div className="message-reply"><Reply size={13} />{messages.find(item => item.id === message.replyToId)?.body.slice(0, 100) || 'Resposta a uma mensagem anterior'}</div>}
          <p className={message.deletedAt ? 'message-deleted' : ''}>{message.deletedAt ? 'Mensagem excluída' : message.body.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => /^https?:\/\//.test(part) ? <button key={index} className="message-link" title="Abrir no navegador" onClick={() => void request({kind: 'openLink', url: part}).catch(e => setError(errorMessage(e)))}>{part}</button> : part)}</p>
          {!message.deletedAt && <div className="message-actions"><button disabled={busy || !!pending} title="Responder" onClick={() => { setReply(message); setEdit(undefined); }}><Reply size={13} />Responder</button>{message.authorId === userId && <><button disabled={busy || !!pending} onClick={() => { setEdit(message); setReply(undefined); changeDraft(message.body); }}><Pencil size={13} />Editar</button><button disabled={busy} onClick={() => setRemoving(message.id)}><Trash2 size={13} />Excluir</button></>}</div>}
          {removing === message.id && <div className="delete-confirm">Excluir esta mensagem? <button disabled={busy} onClick={() => void remove(message)}>Excluir</button><button onClick={() => setRemoving(undefined)}>Cancelar</button></div>}
        </div>
      </article>)}
    </div>
    {error && <div className="chat-error" role="alert">{error} <button onClick={() => void history()}>Atualizar</button></div>}
    <div className="recent-messages">{!atBottom&&<button onClick={()=>{nearBottom.current=true;setAtBottom(true);list.current?.scrollTo({top:list.current.scrollHeight});}}>Voltar às mensagens recentes ↓</button>}</div><div className="typing-status" aria-live="polite">{presence.filter(member => member.id !== userId && member.typingChannelId === channel.id).map(member => member.name).join(', ')}{presence.some(member => member.id !== userId && member.typingChannelId === channel.id) ? ' digitando…' : '\u00a0'}</div>
    <form className="message-composer" onSubmit={submit}>
      {(reply || edit) && <div className="composer-context">{edit ? 'Editando mensagem' : `Respondendo a ${reply?.authorName}`}<button type="button" disabled={busy || !!pending} aria-label="Cancelar resposta ou edição" onClick={() => { setReply(undefined); setEdit(undefined); changeDraft(''); }}><X size={14} /></button></div>}
      <div className="composer-row"><textarea ref={composer} aria-label="Mensagem" placeholder={`Conversar em #${channel.name}`} maxLength={4000} value={draft} readOnly={busy || !!pending} onChange={event => changeDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="button" aria-label="Escolher emoji" aria-expanded={emojis} disabled={busy || !!pending} onClick={()=>setEmojis(!emojis)}><Smile size={20}/></button><button aria-label={pending ? 'Tentar enviar novamente' : edit ? 'Salvar edição' : 'Enviar mensagem'} disabled={busy || !draft.trim()}><Send size={20} /></button></div>
      {emojis&&<div className="emoji-picker" role="group" aria-label="Emojis" onKeyDown={e=>{if(e.key==='Escape'){setEmojis(false);composer.current?.focus();}}}>{['😀','😂','🥰','😎','🤔','😢','😮','👍','👎','👏','🙌','❤️','🔥','🎉','🎮','👀','✅','🚀'].map(emoji=><button key={emoji} type="button" aria-label={'Inserir '+emoji} onClick={()=>{const node=composer.current;const start=node?.selectionStart??draft.length,end=node?.selectionEnd??start;if(draft.length-(end-start)+emoji.length>4000)return;changeDraft(draft.slice(0,start)+emoji+draft.slice(end));setEmojis(false);requestAnimationFrame(()=>{node?.focus();node?.setSelectionRange(start+emoji.length,start+emoji.length);});}}>{emoji}</button>)}</div>}
      <div className="composer-hint"><span>{pending ? 'Envio pendente: tente novamente para confirmar sem duplicar.' : 'Enter para enviar · Shift + Enter para nova linha · Emojis são bem-vindos 🙂'}</span><span>{draft.length}/4000</span></div>
    </form>
  </section>;
}


