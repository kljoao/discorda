import {useEffect,useLayoutEffect,useRef,useState,type MouseEvent,type ReactNode} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {Download,Image as ImageIcon,Film,FileText,Link,Copy,Reply,Trash2,Expand,X,MoreHorizontal,LoaderCircle} from 'lucide-react';
import {Modal} from '../../components/ui/modal';
import {useDialogClose} from '../../components/ui/use-dialog-close';
import {Avatar} from './Avatar';
import {AudioMessage} from './AudioMessage';
import type {ChatMessage} from '../../../shared/ipc/contracts';

type File=NonNullable<ChatMessage['attachments']>[number];
type Operation='preview'|'download'|'copyImage'|'copyLink';
type Preview={preview?:string;content?:string;mime?:string;duration?:number;kind:'image'|'video'|'audio'};
let previews=Promise.resolve();
type Playback={time:number;paused:boolean;volume:number;muted:boolean;rate:number};
function playback(video:HTMLVideoElement):Playback{return {time:video.currentTime,paused:video.paused,volume:video.volume,muted:video.muted,rate:video.playbackRate};}
function restorePlayback(video:HTMLVideoElement,state:Playback,onError:()=>void){
 video.volume=state.volume;video.muted=state.muted;video.playbackRate=state.rate;
 try{video.currentTime=Number.isFinite(video.duration)?Math.min(state.time,Math.max(0,video.duration-.01)):state.time;}catch{/* The player can still start if this container cannot seek yet. */}
 if(!state.paused)void video.play().catch(onError);else video.pause();
}
export function MessageFiles({message,onReply,onDelete,avatarUrl}:{message:ChatMessage;onReply?:()=>void;onDelete?:()=>void;avatarUrl?:string|null}){
 if(message.deletedAt||!message.attachments?.length)return null;
 return <div className="message-files">{message.attachments.map(file=><Attachment key={file.id} file={file} message={message} avatarUrl={avatarUrl} onReply={onReply} onDelete={onDelete}/>)}</div>;
}
function Attachment({file,message,avatarUrl,onReply,onDelete}:{file:File;message:ChatMessage;avatarUrl?:string|null;onReply?:()=>void;onDelete?:()=>void}){
 const channelId=message.channelId;
 const root=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false),[retry,setRetry]=useState(0);
 const [preview,setPreview]=useState<Preview>(),[source,setSource]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[lightbox,setLightbox]=useState(false);
 const inlineVideo=useRef<HTMLVideoElement>(null),viewerVideo=useRef<HTMLVideoElement>(null),position=useRef<Playback>({time:0,paused:true,volume:1,muted:false,rate:1});
 const [audioPlaying,setAudioPlaying]=useState(false);
 const loadMedia=visible||lightbox||audioPlaying;
 const [menu,setMenu]=useState<{id:string;x:number;y:number;host:HTMLElement;previous:HTMLElement|null}>();
 const image=/\.(png|jpe?g|webp)$/i.test(file.name),video=/\.(mp4|webm)$/i.test(file.name),audio=/\.(weba|ogg|mp3|wav|m4a|flac)$/i.test(file.name),media=image||video||audio;
 const voice=audio&&/^voz-\d+ms-/.test(file.name),displayName=voice?'Mensagem de voz':file.name;
 const Icon=image?ImageIcon:video?Film:FileText;
 useEffect(()=>{const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{rootMargin:'300px'});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  if(!loadMedia||!media)return;let active=true,url='';setLoading(true);setError('');
  previews=previews.catch(()=>{}).then(async()=>{if(!active)return;try{const result=await window.discorda!.chat({kind:'attachmentGet',channelId,id:file.id,operation:'preview'});if(!active)return;if(!result.ok)throw Error(result.message);const data=result.data as Preview;if((data.kind==='video'||data.kind==='audio')&&data.content&&data.mime){const binary=atob(data.content),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));url=URL.createObjectURL(new Blob([bytes],{type:data.mime}));setSource(url);}else if(data.preview?.startsWith('data:image/'))setSource(data.preview);else throw Error('Prévia indisponível. Baixe o arquivo para abrir.');setPreview(data);}catch(e){if(active)setError(e instanceof Error?e.message:'Não foi possível carregar a prévia.');}finally{if(active)setLoading(false);}});
  return()=>{active=false;if(url)URL.revokeObjectURL(url);setSource('');setPreview(undefined);};
 },[loadMedia,media,channelId,file.id,retry]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(timer);},[notice]);
 async function run(operation:Operation){if(busy)return;setBusy(true);setError('');setNotice('');try{const result=await window.discorda!.chat({kind:'attachmentGet',channelId,id:file.id,operation});if(!result.ok)throw Error(result.message);const data=result.data as {message?:string;canceled?:boolean}|null;setNotice(data?.message??(data?.canceled?'':'Arquivo salvo.'));}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir.');}finally{setBusy(false);}}
 function openMenu(event:MouseEvent<HTMLElement>){event.preventDefault();event.stopPropagation();setMenu({id:crypto.randomUUID(),x:event.clientX||event.currentTarget.getBoundingClientRect().right,y:event.clientY||event.currentTarget.getBoundingClientRect().bottom,host:event.currentTarget.closest('dialog')??document.body,previous:document.activeElement instanceof HTMLElement?document.activeElement:null});}
 function openViewer(){
  if(!source)return;
  setNotice('');setError('');
  if(inlineVideo.current){position.current=playback(inlineVideo.current);inlineVideo.current.pause();}
  setLightbox(true);
 }
 function closeViewer(){
  if(viewerVideo.current){position.current=playback(viewerVideo.current);viewerVideo.current.pause();}
  setLightbox(false);
  requestAnimationFrame(()=>{if(inlineVideo.current?.isConnected)restorePlayback(inlineVideo.current,position.current,()=>setError('Pressione play para continuar o vídeo no chat.'));});
 }
 const player=source?(preview?.kind==='video'?<><video ref={inlineVideo} src={source} controls controlsList="nodownload" playsInline preload="metadata" style={{visibility:lightbox?'hidden':undefined}} onError={()=>setError('Não foi possível reproduzir este vídeo. Baixe para abrir no seu player.')}/><button type="button" className="video-open-viewer" aria-label={'Ampliar '+file.name} onClick={openViewer}><Expand size={17}/><span>Abrir em tamanho maior</span></button></>:<button type="button" className="image-preview-button" aria-label={'Ampliar '+file.name} onClick={openViewer}><img src={source} alt={file.name}/><span className="media-expand"><Expand size={16}/></span></button>):null;
 return <div ref={root} className={'attachment-card'+(media?' has-media':'')+(audio?' has-audio':'')} onContextMenu={openMenu}>
  {audio&&<AudioMessage src={source} duration={preview?.duration} label={displayName} onPlaying={setAudioPlaying} loading={loading}/>}
  {media&&!audio&&<div className={'attachment-media'+(loading?' is-loading':'')}>{loading?<div className="media-placeholder"><LoaderCircle size={24} className="animate-spin"/><span>Carregando prévia…</span></div>:player||<div className="media-placeholder"><Icon size={28}/><span>Prévia indisponível</span><button onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button></div>}</div>}
  <div className="attachment-caption"><span className="attachment-type"><Icon size={18}/></span><div><strong title={file.name}>{displayName}</strong><small>{file.size<1024?file.size+' B':(file.size/1024/1024).toFixed(2)+' MiB'}{media?' · '+(audio?'Áudio':video?'Vídeo':'Imagem'):''}</small></div><button className="attachment-icon" aria-label={'Baixar '+file.name} disabled={busy} onClick={()=>void run('download')}><Download size={17}/></button><button className="attachment-icon" aria-label={'Opções de '+displayName} aria-haspopup="menu" aria-expanded={!!menu} onClick={openMenu}><MoreHorizontal size={19}/></button></div>
  {notice&&<p className="attachment-notice" role="status">{notice}</p>}{error&&<p className="attachment-error" role="alert">{error}{audio&&!source&&<button type="button" className="audio-load-retry" onClick={()=>setRetry(value=>value+1)}>Carregar áudio novamente</button>}</p>}
  {lightbox&&<MediaLightbox file={file} message={message} avatarUrl={avatarUrl} onClose={closeViewer} onContextMenu={openMenu} download={()=>void run('download')} onReply={onReply} busy={busy} notice={notice} error={error}>
   {preview?.kind==='video'?<video ref={viewerVideo} src={source} controls controlsList="nodownload" playsInline preload="auto" aria-label={'Vídeo ampliado: '+file.name} onLoadedMetadata={event=>restorePlayback(event.currentTarget,position.current,()=>setError('Pressione play para continuar o vídeo.'))} onError={()=>setError('Não foi possível reproduzir este vídeo. Baixe para abrir no seu player.')}/>:<img src={source} alt={file.name}/>}
  </MediaLightbox>}
  {menu&&<AttachmentMenu key={menu.id} point={menu} label={file.name} close={()=>setMenu(current=>current===menu?undefined:current)}>{choose=><>
   {onReply&&<button role="menuitem" onClick={()=>choose(onReply)}><Reply size={16}/><span>Responder</span></button>}
   <div className="menu-separator" role="separator"/>
   {image&&<button role="menuitem" disabled={busy} onClick={()=>choose(()=>void run('copyImage'))}><Copy size={16}/><span>Copiar imagem</span></button>}
   <button role="menuitem" disabled={busy} onClick={()=>choose(()=>void run('download'))}><Download size={16}/><span>Baixar {audio?'áudio':video?'vídeo':image?'imagem':'arquivo'}</span></button>
   <button role="menuitem" disabled={busy} onClick={()=>choose(()=>void run('copyLink'))}><Link size={16}/><span>Copiar link {audio?'do áudio':video?'do vídeo':image?'da imagem':'do arquivo'}</span></button>
   {onDelete&&<><div className="menu-separator" role="separator"/><button role="menuitem" className="danger" onClick={()=>choose(()=>{setLightbox(false);onDelete();})}><Trash2 size={16}/><span>Excluir mensagem</span></button></>}
  </>}</AttachmentMenu>}
 </div>;
}
function MediaLightbox({file,message,avatarUrl,onClose,onContextMenu,download,onReply,busy,notice,error,children}:{file:File;message:ChatMessage;avatarUrl?:string|null;onClose:()=>void;onContextMenu:(event:MouseEvent<HTMLElement>)=>void;download:()=>void;onReply?:()=>void;busy:boolean;notice:string;error:string;children:ReactNode}){
 const next=useRef<(()=>void)|undefined>(undefined);
 const {closing,dismiss}=useDialogClose(()=>{flushSync(onClose);if(next.current)requestAnimationFrame(next.current);});
 const date=new Date(message.createdAt);
 return <Modal label={'Prévia de '+file.name} className={'media-lightbox'+(closing?' is-closing':'')} onClose={dismiss}>
  <header><div className="lightbox-author"><Avatar url={avatarUrl} name={message.authorName}/><div><strong>{message.authorName}</strong><time dateTime={message.createdAt}>{date.toLocaleDateString('pt-BR')} às {date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time></div></div><div className="lightbox-toolbar">
   <div className="lightbox-actions">{onReply&&<button aria-label="Responder à mensagem" data-tooltip="Responder" onClick={()=>{next.current=onReply;dismiss();}}><Reply size={19}/></button>}<button aria-label="Baixar arquivo" data-tooltip="Baixar arquivo" disabled={busy} onClick={download}><Download size={19}/></button><button aria-label="Mais opções da mídia" data-tooltip="Mais opções" aria-haspopup="menu" onClick={onContextMenu}><MoreHorizontal size={20}/></button></div><button className="lightbox-close" aria-label="Fechar prévia" data-tooltip="Fechar · Esc" onClick={dismiss}><X size={22}/></button>
  </div></header>
  <div className="lightbox-content" onContextMenu={onContextMenu} onClick={event=>{if(event.target===event.currentTarget)dismiss();}}>{children}</div>
  <footer><span className="lightbox-filename">{file.name}</span><span>Clique com o botão direito para mais opções <kbd>ESC</kbd> para fechar</span></footer>
  {(notice||error)&&<div className={'lightbox-feedback'+(error?' is-error':'')} role={error?'alert':'status'}>{error||notice}</div>}
 </Modal>;
}
function AttachmentMenu({point,label,close,children}:{point:{x:number;y:number;host:HTMLElement;previous:HTMLElement|null};label:string;close:()=>void;children:(choose:(callback:()=>void)=>void)=>ReactNode}){
 const root=useRef<HTMLDivElement>(null),[position,setPosition]=useState({left:point.x,top:point.y}),action=useRef<(()=>void)|undefined>(undefined);
 const {closing,dismiss}=useDialogClose(()=>{close();if(point.previous?.isConnected)point.previous.focus({preventScroll:true});action.current?.();});
 useLayoutEffect(()=>{const box=root.current!.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(point.x,innerWidth-box.width-8)),top:Math.max(8,Math.min(point.y,innerHeight-box.height-8))});root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});},[point]);
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))dismiss();};const scroll=()=>dismiss();document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',scroll);document.addEventListener('scroll',scroll,true);return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',scroll);document.removeEventListener('scroll',scroll,true);};},[]);
 return createPortal(<div ref={root} role="menu" aria-label={'Opções de '+label} className={'attachment-menu'+(closing?' is-closing':'')} style={position} onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{
  if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();event.stopPropagation();dismiss();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...root.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus({preventScroll:true});
 }}>{children(callback=>{action.current=callback;dismiss();})}</div>,point.host);
}
