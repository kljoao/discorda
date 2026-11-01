import {useRef,useState} from 'react';
import {Hash,Volume2,X,ArrowRight,Smile} from 'lucide-react';
import {useDialogClose} from '../../components/ui/use-dialog-close';
import {Modal} from '../../components/ui/modal';

export function CreateChannel({type,close,created}:{type:'text'|'voice';close:()=>void;created:(id:string)=>Promise<void>}){
 const {closing,dismiss}=useDialogClose(close);
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[emojis,setEmojis]=useState(false);
 const input=useRef<HTMLInputElement>(null);const voice=type==='voice',Icon=voice?Volume2:Hash;
 async function submit(){if(busy||!name.trim())return;setBusy(true);setError('');try{const result=await window.discorda!.chat({kind:'channel',name:name.trim(),type});if(!result.ok)throw Error(result.message);await created((result.data as {id:string}).id);dismiss();}catch(e){setError(e instanceof Error?e.message:'Não foi possível criar o canal.');}finally{setBusy(false);}}
 return <Modal label={voice?'Criar canal de voz':'Criar canal de texto'} className={"create-channel-dialog"+(closing?" is-closing":"")} onClose={()=>{if(!busy)dismiss();}}>
  <button className="channel-modal-close" aria-label="Fechar criação de canal" disabled={busy} onClick={dismiss}><X size={20}/></button>
  <div className="channel-modal-icon"><Icon size={28}/></div><span className="eyebrow">UM NOVO ESPAÇO PARA O GRUPO</span>
  <h2>{voice?'Criar canal de voz':'Criar canal de texto'}</h2><p>{voice?'Entre, puxe uma cadeira e deixe a conversa acontecer. Um lugar para ouvir, jogar e compartilhar.':'Uma ideia vira conversa. Compartilhe mensagens, imagens, GIFs e aquele emoji que diz tudo.'}</p>
  <form onSubmit={event=>{event.preventDefault();void submit();}}><label htmlFor="new-channel-name">NOME DO CANAL</label><div className="channel-name-field"><Icon size={19}/><input id="new-channel-name" aria-label="Nome do canal" ref={input} data-autofocus value={name} disabled={busy} maxLength={80} placeholder={voice?'🎮 Sala dos amigos':'💬 papo-livre'} onChange={e=>setName(e.target.value)}/><button type="button" aria-label="Adicionar emoji ao nome" aria-expanded={emojis} disabled={busy} onClick={()=>setEmojis(!emojis)}><Smile size={19}/></button></div>
   {emojis&&<div className="channel-emojis" role="group" aria-label="Emojis para o canal">{['💬','🎮','🎵','☕','📸','🎬','✨','🚀','🌙','🔥','💡','🎉'].map(emoji=><button key={emoji} type="button" aria-label={'Adicionar '+emoji} onClick={()=>{const node=input.current,start=node?.selectionStart??name.length,end=node?.selectionEnd??start;const value=name.slice(0,start)+emoji+name.slice(end);if(value.length<=80)setName(value);setEmojis(false);requestAnimationFrame(()=>{node?.focus();node?.setSelectionRange(start+emoji.length,start+emoji.length);});}}>{emoji}</button>)}</div>}
   <div className="channel-name-hint"><span>Emojis são bem-vindos. Faça esse espaço ser seu.</span><span>{name.length}/80</span></div>
   <div className="channel-preview"><span>PRÉVIA NA SIDEBAR</span><div><Icon size={18}/>{name.trim()||(voice?'Seu novo canal de voz':'seu-novo-canal')}</div></div>
   {error&&<p role="alert" className="channel-create-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={dismiss}>Cancelar</button><button className="primary-button" disabled={busy||!name.trim()}>{busy?'Criando canal…':'Criar canal'}<ArrowRight size={16}/></button></footer>
  </form>
 </Modal>;
}
