import {useEffect,useRef,useState,type CSSProperties,type MouseEvent} from 'react';
import {Track,type Participant,type RemoteTrackPublication,type TrackPublication} from 'livekit-client';
import {ChevronDown,ChevronUp,Columns2,EyeOff,Focus,LayoutGrid,Maximize2,Mic,MicOff,Minimize2,Monitor,MonitorUp,PhoneOff,Pin,PinOff,Play,Users,Video,VideoOff} from 'lucide-react';
import {Avatar} from './Avatar';
import {StreamWindow} from './StreamWindow';
import {StreamVolume} from './StreamVolume';
import {TrackVideo} from './TrackVideo';
import {defaultVolume,type MemberVolume} from './playback';
import {streamKey} from './stream-subscriptions';
import './voice-stage.css';

type Layout='focus'|'overview'|'mosaic';
type Props={
  name:string;connecting?:boolean;reconnecting?:boolean;participants:Participant[];watching:ReadonlySet<string>;busy:boolean;deaf:boolean;testing:boolean;expanded:boolean;
  volumes:Record<string,MemberVolume>;memberKey:(participant:Participant)=>string;avatar:(participant:Participant)=>string|null|undefined;
  onWatch:(key:string)=>void;onStopWatching:(keys:string[])=>void;onVolume:(id:string,value:number)=>void;onMute:(id:string)=>void;
  onMemberVolume:(participant:Participant,event:MouseEvent)=>void;
  onMicrophone:()=>void;onCamera:()=>void;onShare:()=>void;onLeave:()=>void;onExpand:()=>void;
};

// Fit every visible card within the available stage; the participant rail scrolls independently.
function useGrid(count:number) {
  const ref=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:800,height:500});
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));
    observer.observe(element);return()=>observer.disconnect();
  },[]);
  let best={width:0,height:0,columns:1};
  for(let columns=1;columns<=Math.max(count,1);columns++) {
    const rows=Math.ceil(count/columns)||1;
    const width=Math.max(1,Math.min((size.width-12*(columns-1))/columns,(size.height-12*(rows-1))/rows*16/9));
    if(width>best.width)best={width,height:width*9/16,columns};
  }
  return {ref,columns:best.columns,style:{'--room-columns':best.columns,'--room-tile-width':best.width+'px','--room-tile-height':best.height+'px'} as CSSProperties};
}

export function VoiceStage(props:Props) {
  const {participants,watching,busy}=props,local=participants.find(participant=>participant.isLocal);
  const streamElements=useRef(new Map<string,HTMLElement>());
  const catalog=useRef(new Map<string,{participant:Participant;publication:TrackPublication;key:string}>());
  const roomRef=useRef<HTMLElement>(null),idle=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [layout,setLayout]=useState<Layout>('focus'),[focus,setFocus]=useState<string[]>([]),[preview,setPreview]=useState<string[]>([]);
  const [railHidden,setRailHidden]=useState(false);
  const [awake,setAwake]=useState(true),[fullscreen,setFullscreen]=useState(false),[fullscreenError,setFullscreenError]=useState('');
  const currentStreams=participants.flatMap(participant=>[...participant.videoTrackPublications.values()]
    .filter(publication=>publication.source===Track.Source.ScreenShare)
    .map(publication=>({participant,publication,key:streamKey(participant,publication)})));
  const currentKeys=new Set(currentStreams.map(stream=>stream.key));
  currentStreams.forEach(stream=>catalog.current.set(stream.key,stream));
  for(const key of catalog.current.keys())if(!currentKeys.has(key)&&!watching.has(key))catalog.current.delete(key);
  const streams=[...currentStreams.map(stream=>({...stream,pending:false})),...[...catalog.current.values()].filter(stream=>!currentKeys.has(stream.key)&&watching.has(stream.key)).map(stream=>({...stream,pending:true}))];
  const available=streams.filter(stream=>stream.participant.isLocal||watching.has(stream.key));
  const selected=focus.filter(key=>available.some(stream=>stream.key===key));
  const focused=selected.length?selected:available.slice(-1).map(stream=>stream.key);
  const mode=available.length?layout:'overview';
  const visible=streams.filter(stream=>mode==='overview'||mode==='mosaic'&&available.includes(stream)||mode==='focus'&&focused.includes(stream.key));
  const shownKeys=new Set(visible.map(stream=>stream.key));
  const grid=useGrid(visible.length+(mode==='overview'?participants.length:0));
  const targets=visible.filter(stream=>!stream.participant.isLocal&&watching.has(stream.key)).map(stream=>stream.key);
  function wake(){setAwake(true);clearTimeout(idle.current);idle.current=setTimeout(()=>setAwake(false),2400);}
  useEffect(()=>{wake();return()=>clearTimeout(idle.current);},[]);
  useEffect(()=>{
    const changed=()=>setFullscreen([...streamElements.current.values()].some(element=>document.fullscreenElement===element));
    document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);
  },[]);
  async function maximize(key:string){
    try {setFullscreenError('');if(document.fullscreenElement)await document.exitFullscreen();else await streamElements.current.get(key)?.requestFullscreen({navigationUI:'hide'});}
    catch {setFullscreenError('Não foi possível abrir em tela cheia. Tente novamente.');}
  }
  function start(key:string){props.onWatch(key);setFocus(previous=>[...previous.filter(item=>available.some(stream=>stream.key===item)),key]);setLayout('focus');wake();}
  function spotlight(key:string){setFocus([key]);setLayout('focus');wake();}
  function toggleFocus(key:string){
    const next=focused.includes(key)?focused.filter(item=>item!==key):[...focused,key];
    setFocus(next);setLayout(next.length?'focus':'mosaic');wake();
  }
  function stop(keys:string[]){props.onStopWatching(keys);setFocus(previous=>previous.filter(key=>!keys.includes(key)));wake();}
  function person(participant:Participant,rail=false) {
    const camera=participant.getTrackPublication(Track.Source.Camera),name=participant.name||'Participante';
    const centered=!rail&&grid.columns>1&&participant===participants.at(-1)&&(visible.length+participants.length)%grid.columns===1;
    return <div key={'person:'+participant.identity} style={centered?{gridColumn:'1 / -1',justifySelf:'center',width:'var(--room-tile-width)'}:undefined} className={'room-person '+(participant.isSpeaking?'is-speaking ':'')+(!camera?.track||camera.isMuted?'room-avatar-tile':'')} onContextMenu={event=>{if(!participant.isLocal){event.preventDefault();props.onMemberVolume(participant,event);}}}>
      {camera?.track&&!camera.isMuted?<TrackVideo track={camera.track}/>:<div className="room-avatar"><Avatar url={props.avatar(participant)} name={name}/></div>}
      <div className="room-person-caption room-hover-control"><span>{name}{participant.isLocal?' (você)':''}</span>{!participant.isMicrophoneEnabled&&<MicOff size={13}/>}</div>
      {!participant.isLocal&&<button type="button" className="room-member-volume room-icon-button room-hover-control" aria-label={'Ajustar volume de '+name} title={'Volume de '+name} onClick={event=>props.onMemberVolume(participant,event)}><Users size={14}/></button>}
      {rail&&participant.isSpeaking&&<span className="room-speaking-dot" aria-label="Falando"/>}
    </div>;
  }
  return <section ref={roomRef} className={'voice-room'+(props.expanded?' cinema-mode':'')+(awake?' controls-awake':'')+(railHidden?' rail-hidden':'')} aria-label={'Chamada '+props.name} data-layout={mode} onPointerMove={wake} onPointerEnter={wake} onPointerLeave={()=>{clearTimeout(idle.current);setAwake(false);}}>
    <header className="room-header room-hover-control"><div><Users size={16}/><strong>{props.name}</strong><span>{participants.length} participantes</span></div></header>
    {mode==='overview'&&<div className="room-layouts room-hover-control" role="group" aria-label="Organizar a sala">
      <button type="button" className="room-icon-button" disabled={!available.length} aria-label="Foco nas transmissões" title="Foco nas transmissões" aria-pressed={false} onClick={()=>{setLayout('focus');wake();}}><Focus size={18}/></button>
      <button type="button" className="room-icon-button" aria-label="Visão global" title="Visão global" aria-pressed={mode==='overview'} onClick={()=>{setLayout('overview');wake();}}><LayoutGrid size={18}/></button>
      <button type="button" className="room-icon-button" disabled={!available.length} aria-label="Mosaico de transmissões" title="Mosaico de transmissões" aria-pressed={false} onClick={()=>{setLayout('mosaic');wake();}}><Columns2 size={18}/></button>
      <span className="room-control-divider"/>
      <button type="button" className="room-icon-button" aria-label={props.expanded?'Sair do cinema (Esc)':'Modo cinema'} title={props.expanded?'Sair do cinema (Esc)':'Modo cinema'} onClick={props.onExpand}>{props.expanded?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button>
    </div>}
    <div className="room-canvas" ref={grid.ref} style={grid.style}>
      {streams.map(({participant,publication,key,pending})=>{
        const name=participant.name||'Participante',own=participant.isLocal,watch=own||watching.has(key),playing=watch&&!pending&&(!own||preview.includes(key));
        const id=props.memberKey(participant),volume=props.volumes[id]??defaultVolume;
        return <article ref={element=>{if(element)streamElements.current.set(key,element);else streamElements.current.delete(key);}} key={key} className={'room-stream'+(watch?' is-watching':' is-invitation')} hidden={!shownKeys.has(key)} aria-label={'Transmissão de '+name}>
          {playing&&publication.track&&publication.track.mediaStreamTrack.readyState==='live'&&!publication.isMuted?<><TrackVideo track={publication.track} screen publication={!own?publication as RemoteTrackPublication:undefined}/><button type="button" className="room-video-toggle" aria-label={mode==='overview'?'Focar transmissão de '+name:'Ver visão global da sala'} onClick={()=>{if(document.fullscreenElement)return;mode==='overview'?spotlight(key):(setLayout('overview'),wake());}}/></>:<div className="room-stream-placeholder"><Monitor size={32}/>{own?<><strong>Sua transmissão está ao vivo</strong><p>A prévia está pausada para economizar recursos.</p><button type="button" className="room-watch-button" onClick={()=>setPreview(previous=>previous.includes(key)?previous:previous.concat(key))}>Ver minha prévia</button></>:watch?<><strong>{pending||props.reconnecting?'Reconectando à transmissão…':publication.isMuted?'A transmissão está pausada':'Conectando à transmissão…'}</strong><p>{name}</p><button type="button" className="room-watch-button" onClick={()=>stop([key])}>Cancelar visualização</button></>:<><Avatar url={props.avatar(participant)} name={name}/><strong>{name} está compartilhando a tela</strong><button type="button" className="room-watch-button" aria-label={'Assista a transmissão de '+name} onClick={()=>start(key)}><Play size={15} fill="currentColor"/>Assista a transmissão</button></>}</div>}
          <span className="room-stream-name room-hover-control"><Monitor size={13}/>{own?'Sua tela':name}</span>
          {watch&&<div className="room-stream-actions room-hover-control">
            <button type="button" className="room-icon-button" aria-label={(focused.includes(key)?'Remover do foco: ':'Adicionar ao foco: ')+name} title={focused.includes(key)?'Remover do foco':'Adicionar ao foco'} aria-pressed={focused.includes(key)} onClick={()=>toggleFocus(key)}>{focused.includes(key)?<PinOff size={17}/>:<Pin size={17}/>}</button>
            {!own&&<><button type="button" className="room-icon-button" aria-label={'Parar de visualizar '+name} title="Parar de visualizar" onClick={()=>stop([key])}><EyeOff size={18}/></button><StreamVolume name={name} volume={volume.screen} muted={!!volume.screenMuted} onVolume={value=>props.onVolume(id,value)} onMute={()=>props.onMute(id)}/></>}
            {playing&&publication.track&&<StreamWindow iconOnly track={publication.track} name={name+' · Tela'} audio={!own?{volume:volume.screen,muted:!!volume.screenMuted,onVolume:value=>props.onVolume(id,value),onMute:()=>props.onMute(id)}:undefined}/>}
            <button type="button" className="room-icon-button" aria-label={'Tela cheia: '+name} title={fullscreen?'Sair da tela cheia':'Tela cheia'} onClick={()=>void maximize(key)}>{fullscreen?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button>
          </div>}
        </article>;
      })}
      {mode==='overview'&&participants.map(participant=>person(participant))}
    </div>
    {mode!=='overview'&&<div className="room-rail-shell"><button type="button" className="room-rail-toggle" aria-label={railHidden?'Mostrar participantes':'Ocultar participantes'} aria-expanded={!railHidden} aria-controls="room-participant-rail" title={railHidden?'Mostrar participantes':'Ocultar participantes'} onClick={()=>{setRailHidden(value=>!value);wake();}}>{railHidden?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button><div className="room-rail-collapse" inert={railHidden}><div id="room-participant-rail" className="room-filmstrip" style={{'--rail-count':streams.length+participants.length} as CSSProperties} aria-label="Transmissões e participantes">
      {streams.map(({participant,key})=><div key={key} className={'room-stream-shortcut'+(focused.includes(key)?' is-focused':'')}><Monitor size={21}/><span>{participant.isLocal?'Sua tela':participant.name}</span><small>{participant.isLocal?'AO VIVO':watching.has(key)?'ASSISTINDO':'AO VIVO'}</small><button type="button" aria-label={participant.isLocal||watching.has(key)?'Focar transmissão de '+(participant.name||'Participante'):'Assista a transmissão de '+(participant.name||'Participante')} onClick={()=>participant.isLocal||watching.has(key)?spotlight(key):start(key)}><span>{participant.isLocal||watching.has(key)?'Ver em foco':'Assista a transmissão'}</span></button>{(participant.isLocal||watching.has(key))&&!focused.includes(key)&&<button type="button" className="room-rail-pin" aria-label={'Adicionar ao foco: '+participant.name} title="Adicionar ao foco" onClick={()=>toggleFocus(key)}><Pin size={14}/></button>}</div>)}
      {participants.map(participant=>person(participant,true))}
    </div></div></div>}
    <footer className="room-toolbar room-hover-control"><div className="room-call-actions" role="group" aria-label="Controles da sala">
      <button type="button" className={'room-action'+(!local?.isMicrophoneEnabled?' is-off':'')} disabled={busy||props.deaf||props.testing} aria-label={local?.isMicrophoneEnabled?'Silenciar microfone da sala':'Ligar microfone da sala'} title={local?.isMicrophoneEnabled?'Silenciar microfone':'Ligar microfone'} aria-pressed={!!local?.isMicrophoneEnabled} onClick={props.onMicrophone}>{local?.isMicrophoneEnabled?<Mic size={21}/>:<MicOff size={21}/>}</button>
      <button type="button" className="room-action" disabled={busy} aria-label={local?.isCameraEnabled?'Desligar webcam':'Ligar webcam'} title={local?.isCameraEnabled?'Desligar webcam':'Ligar webcam'} aria-pressed={!!local?.isCameraEnabled} onClick={props.onCamera}>{local?.isCameraEnabled?<Video size={21}/>:<VideoOff size={21}/>}</button>
      <span className="room-control-divider"/>
      <button type="button" className="room-action" disabled={busy} aria-label={local?.isScreenShareEnabled?'Encerrar minha transmissão':'Compartilhar minha tela'} title={local?.isScreenShareEnabled?'Encerrar minha transmissão':'Compartilhar tela'} aria-pressed={!!local?.isScreenShareEnabled} onClick={props.onShare}><MonitorUp size={21}/></button>
      {!!targets.length&&<button type="button" className="room-action room-stop-watching" aria-label="Parar de visualizar" title={targets.length>1?'Parar de visualizar estas transmissões':'Parar de visualizar'} onClick={()=>stop(targets)}><EyeOff size={21}/></button>}
      <button type="button" className="room-action room-disconnect" aria-label="Desconectar da sala" title="Sair da chamada" onClick={props.onLeave}><PhoneOff size={21}/></button>
    </div></footer>
    {props.connecting&&<div className="room-connecting" role="status"><span/>Entrando na chamada…</div>}
    {!streams.length&&!props.connecting&&<span className="room-empty-hint room-hover-control">A conversa é de vocês. Compartilhe uma tela para assistir juntos.</span>}
    {fullscreenError&&<p className="room-fullscreen-error" role="alert">{fullscreenError}</p>}
  </section>;
}
