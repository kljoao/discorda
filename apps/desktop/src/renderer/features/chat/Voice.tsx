import {scopedKey} from '../../lib/server-scope';
import {StreamWindow} from './StreamWindow';
import { mediaErrorMessage } from './media-errors';
import {videoHealth,type VideoSample} from './media-quality';
import {Modal} from '../../components/ui/modal';
import {AudioSetup,ShortcutControls,readShortcuts} from './AudioSetup';
import { Diagnostics } from './Diagnostics';
import { SettingsDialog } from './SettingsDialog';
import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Room, RoomEvent, Track, RemoteVideoTrack, LocalVideoTrack, VideoQuality, type RemoteTrackPublication, LocalAudioTrack, createLocalAudioTrack, type Participant, type RemoteAudioTrack, type RemoteParticipant } from 'livekit-client';
import { Volume2, Mic, MicOff, Video, MonitorUp, PhoneOff, Headphones, X, Maximize2, Settings2, VideoOff, MessageSquare, VolumeX, Settings, ChevronUp, ChevronDown, Signal } from 'lucide-react';
import { bindCallSounds, type CallSound } from './call-sounds';
import { CallRecovery, canRecover } from './recovery';
import { Avatar } from './Avatar';
import { VoicePlayback, readVolumes, defaultVolume, type MemberVolume } from './playback';
import {UpdateControls,UpdateNotice} from '../updates/UpdateControls';
import { DevicePermissions } from './DevicePermissions';
import { screenOptions, screenProfiles, type ScreenIntent } from './screen-quality';
import { shareApplicationAudio } from './application-audio';
import { MicrophoneControls } from './MicrophoneSettings';
import { MicrophoneProcessor, readMicrophoneSettings, type MicrophoneSettings } from './microphone';
import type { CaptureSource, MediaGrant, VoiceMember, PresenceMember } from '../../../shared/ipc/contracts';

type Channel = { id: string; name: string };
export function Voice({ presence=[], channels, userId, mediaHost, dockHost, open, setOpen, onChannel, self }: { presence?:PresenceMember[];channels:Channel[];self?:PresenceMember;userId?:string;mediaHost:HTMLElement|null;dockHost:HTMLElement|null;open:boolean;setOpen:(open:boolean)=>void;onChannel:(name:string|undefined)=>void }) {
  const [roster, setRoster] = useState<VoiceMember[]>([]);
  const [speakers,setSpeakers]=useState<Record<string,{speaking:boolean;until:number}>>({});
  useEffect(()=>{const off=window.discorda?.onLiveEvent(event=>{if(event.kind==='voice')setSpeakers(previous=>({...previous,[event.data.leaseId]:{speaking:event.data.speaking,until:Date.now()+2500}}));});const timer=setInterval(()=>setSpeakers(previous=>Object.fromEntries(Object.entries(previous).filter(([,s])=>s.until>Date.now()))),1000);return()=>{off?.();clearInterval(timer);};},[]);
  const [rosterError, setRosterError] = useState(false);
  const [audioSettings, setAudioSettings] = useState(false);
  const [settingsTab,setSettingsTab]=useState<'audio'|'updates'>('audio');
  const [testing, setTesting] = useState(false);
  const [microphone, setMicrophone] = useState(readMicrophoneSettings);
  const [level, setLevel] = useState({db:-90,open:false});
  const [shortcuts,setShortcuts]=useState(readShortcuts);
  const [processor] = useState(() => new MicrophoneProcessor(microphone));
  const [pinned, setPinned] = useState<string>();
  const [prioritizeScreen, setPrioritizeScreen] = useState(true);
  function configureMicrophone(settings: MicrophoneSettings) {setMicrophone(settings);processor.configure({...settings,pushToTalk:shortcuts.enabled&&shortcuts.pushToTalk});try{localStorage.setItem('discorda:microphone',JSON.stringify(settings));}catch{/* In-memory preferences still work. */}}
  useEffect(()=>{processor.onLevel=setLevel;return()=>{processor.onLevel=undefined;};},[processor]);
  useEffect(()=>{
    let alive=true, fetching=false;
    const load=async()=>{if(fetching)return;fetching=true;try{const result=await window.discorda!.chat({kind:'voiceRoster'});if(alive){setRoster(result.ok&&Array.isArray(result.data)?result.data as VoiceMember[]:[]);setRosterError(!result.ok);}}catch{if(alive){setRoster([]);setRosterError(true);}}finally{fetching=false;}};
    void load();const timer=setInterval(()=>void load(),4000);return()=>{alive=false;clearInterval(timer);};
  },[]);
  const [room, setRoom] = useState<Room>();
  const [channel, setChannel] = useState<Channel>();

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [revision, update] = useState(0);
  const [deaf, setDeaf] = useState(false);
  const [soundVolume,setSoundVolume]=useState(()=>{try{const value=Number(localStorage.getItem('discorda:call-sounds')??'50');return Number.isFinite(value)?Math.max(0,Math.min(100,value)):50;}catch{return 50;}});
  const soundPreferences=useRef({deaf,soundVolume});soundPreferences.current={deaf,soundVolume};
  function notify(playback:VoicePlayback|undefined,kind:CallSound){const preferences=soundPreferences.current;return playback?.notify(kind,preferences.deaf?0:preferences.soundVolume).catch(()=>{});}
  const [deviceMenu,setDeviceMenu]=useState<'audioinput'|'audiooutput'>();
  const [outputDevice,setOutputDevice]=useState(()=>{try{return localStorage.getItem('discorda:output')??'';}catch{return '';}});
  const [ping,setPing]=useState<number>();
  useEffect(()=>{if(!room){setPing(undefined);return;}let alive=true;const sample=async()=>{try{const manager=room.engine.pcManager;const reports=await Promise.all([manager?.publisher.getStats(),manager?.subscriber?.getStats()]);const pairs=reports.flatMap(r=>r?[...r.values()]:[]).filter(r=>r.type==='candidate-pair'&&r.state==='succeeded'&&r.nominated&&typeof r.currentRoundTripTime==='number');if(alive)setPing(pairs.length?Math.round(Math.max(...pairs.map(r=>r.currentRoundTripTime))*1000):undefined);}catch{if(alive)setPing(undefined);}};void sample();const timer=setInterval(()=>void sample(),3000);return()=>{alive=false;clearInterval(timer);};},[room]);
  async function chooseDevice(kind:'audioinput'|'audiooutput',value:string){if(kind==='audioinput'){if(room)await room.switchActiveDevice(kind,value);configureMicrophone({...microphone,deviceId:value});}else{await active.current?.playback?.output(value);setOutputDevice(value);try{localStorage.setItem('discorda:output',value);}catch{}}setDeviceMenu(undefined);}
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [sources, setSources] = useState<CaptureSource[]>();
  const [excludeBrowsers,setExcludeBrowsers]=useState(false);
  const [screenAudio, setScreenAudio] = useState(false);
  const [quality, setQuality] = useState<keyof typeof screenProfiles|'auto'>('auto');
  const [intent,setIntent]=useState<ScreenIntent>('auto');
  const [fps,setFps]=useState<30|60>(60);
  const [audioSupported,setAudioSupported]=useState(true);
  const [audioError,setAudioError]=useState('');
  const [volumes,setVolumes]=useState(readVolumes);
  const [volumeMenu,setVolumeMenu]=useState<{id:string;name:string;x:number;y:number}>();
  const menuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!volumeMenu)return;const dismiss=(e:PointerEvent)=>{if(!menuRef.current?.contains(e.target as Node))setVolumeMenu(undefined);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setVolumeMenu(undefined);};document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};},[volumeMenu]);
  useEffect(()=>onChannel(channel?.name),[channel?.name,onChannel]);
  function changeVolume(id:string,kind:keyof MemberVolume,value:number){setVolumes(previous=>{const next={...previous,[id]:{...(previous[id]??defaultVolume),[kind]:value}};try{localStorage.setItem(scopedKey('member-volumes'),JSON.stringify(next));}catch{}return next;});}
  const rosterByLease=useMemo(()=>new Map(roster.map(r=>[r.leaseId,r.userId])),[roster]);
  const presenceById=useMemo(()=>new Map(presence.map(p=>[p.id,p])),[presence]);
  const rosterByChannel=useMemo(()=>{const map=new Map<string,VoiceMember[]>();for(const member of roster){const entries=map.get(member.channelId)??[];entries.push(member);map.set(member.channelId,entries);}return map;},[roster]);
  function memberKey(p:Participant){return rosterByLease.get(p.identity)??p.identity;}
  function openVolume(id:string,name:string,x:number,y:number){setVolumeMenu({id,name,x:Math.max(8,Math.min(x,window.innerWidth-284)),y:Math.max(8,Math.min(y,window.innerHeight-258))});}
  const applicationStop=useRef<(()=>Promise<void>)|undefined>(undefined);
  async function stopApplication(){const stop=applicationStop.current;applicationStop.current=undefined;await stop?.();}
  const active = useRef<{ room: Room; channel: Channel; joined?:boolean; grant?: MediaGrant; audioContext?: AudioContext; playback?:VoicePlayback; sounds?:ReturnType<typeof bindCallSounds> } | undefined>(undefined);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const recovery=useRef(new CallRecovery());
  const recoveryJoin=useRef<(next:Channel,mic:boolean)=>Promise<boolean>>(async()=>false);
  const lastAck=useRef(0),recovering=useRef(false);
  async function recoverCall(){
    const current=active.current;if(!current||recovering.current)return;
    recovering.current=true;const target=current.channel,mic=current.room.localParticipant.isMicrophoneEnabled&&!soundPreferences.current.deaf;
    const cleanup=leave(true);const ticket=generation.current;await cleanup;
    if(!mounted.current||generation.current!==ticket)return;
    setChannel(target);setStatus('Reconectando…');
    recovery.current.start(()=>recoveryJoin.current(target,mic),()=>{recovering.current=false;setChannel(undefined);setStatus('');setError('Não foi possível recuperar a chamada. Entre novamente quando a conexão voltar.');});
  }
  async function leave(preserveRecovery=false) {
    if(!preserveRecovery){recovery.current.cancel();recovering.current=false;}
    generation.current++;
    const current = active.current; active.current = undefined;
    if (mounted.current) { setRoom(undefined); setChannel(undefined); setOpen(false); setSources(undefined); if(!preserveRecovery)setDeaf(false); setStatus(''); setPinned(undefined); setLevel({db:-90,open:false}); }
    const wasConnected=current?.sounds?.stop();
    const goodbye=wasConnected&&mounted.current&&!preserveRecovery?notify(current?.playback,'leave'):undefined;
    current?.room.localParticipant.trackPublications.forEach(p=>p.track?.stop());
    await stopApplication();
    await goodbye;
    await current?.playback?.close();
    if (current) {
      // Stop devices synchronously, even if signaling is unavailable.
      current.room.localParticipant.trackPublications.forEach(p => p.track?.stop());
      await current.room.disconnect(true);
      if(current.audioContext && current.audioContext.state!=="closed")await current.audioContext.close();
      if (current.grant) await window.discorda?.media({kind: 'leave', channelId: current.channel.id, leaseId: current.grant.leaseId});
    }
  }
  useEffect(() => {
    mounted.current = true;
    let pending=false;
    const online=()=>{recovery.current.retryNow();void active.current?.playback?.resume();};
    window.addEventListener('online',online);
    const pulse = setInterval(async () => {
      const current=active.current;if(!current?.grant||pending)return;pending=true;
      try{
        const result=await window.discorda!.media({kind:'pulse',channelId:current.channel.id,leaseId:current.grant.leaseId});
        if(active.current!==current)return;
        if(result.ok){lastAck.current=Date.now();if(current.room.state==='connected')setStatus('Conectado');}
        else if(result.status===401||result.status===403){await leave();setError('Sua sessão não está autorizada. Entre novamente.');}
        else if(result.status===409||Date.now()-lastAck.current>30000)await recoverCall();
        else setStatus('Reconectando…');
      }catch{if(active.current===current&&Date.now()-lastAck.current>30000)await recoverCall();}
      finally{pending=false;}
    },5000);
    return () => { mounted.current = false; window.removeEventListener('online',online);clearInterval(pulse); void leave(); };
  }, []);
  async function perform(action: () => Promise<unknown>) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (error) { if (mounted.current) setError(mediaErrorMessage(error)); }
    finally { busyRef.current = false; if (mounted.current) { setBusy(false); update(x => x + 1); } }
  }
  async function join(next: Channel, retry=false) {
    if (active.current?.channel.id === next.id) { setOpen(true); return; }
    setAudioSettings(false);
    await leave(retry);
    const epoch = generation.current;
    setStatus('Entrando…'); setChannel(next); setOpen(false);
    const nextRoom = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: microphone.noiseSuppression!==false, autoGainControl: true, deviceId:microphone.deviceId || undefined }, videoCaptureDefaults: { resolution: {width: 1280, height: 720, frameRate: 30} } });
    const current = { room: nextRoom, channel: next, joined:false, playback:new VoicePlayback(), grant: undefined as MediaGrant | undefined, sounds:undefined as ReturnType<typeof bindCallSounds>|undefined };
    active.current = current;
    current.sounds=bindCallSounds(nextRoom,kind=>{if(active.current===current)void notify(current.playback,kind);});
    const changed = () => { if (active.current === current && mounted.current) update(x => x + 1); };
    for (const event of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ActiveSpeakersChanged, RoomEvent.ConnectionQualityChanged, RoomEvent.ParticipantNameChanged]) nextRoom.on(event, changed);
    nextRoom.on(RoomEvent.LocalTrackUnpublished,p=>{if(p.source===Track.Source.ScreenShare)void stopApplication();});
    nextRoom.on(RoomEvent.Reconnecting, () => { if (active.current === current) setStatus('Reconectando…'); });
    nextRoom.on(RoomEvent.Reconnected, () => { if (active.current === current) setStatus('Conectado'); });
    nextRoom.on(RoomEvent.SignalReconnecting,()=>{if(active.current===current)setStatus('Reconectando…');});
    nextRoom.on(RoomEvent.Disconnected, reason => { if (active.current === current && current.joined) { if(canRecover(reason))void recoverCall();else{void leave();if(mounted.current)setError('A chamada foi encerrada pelo servidor.');} } });
    try {
      const result = await window.discorda!.media({kind: 'join', channelId: next.id});
      if (!result.ok) {if(result.status===401||result.status===403){recovery.current.cancel();recovering.current=false;}throw new Error(result.message);}
      current.grant = result.data as MediaGrant;
      if (epoch !== generation.current || !mounted.current) {
        await window.discorda!.media({kind: 'leave', channelId: next.id, leaseId: current.grant.leaseId}); return;
      }
      await nextRoom.connect(current.grant.url, current.grant.token);
      // Join with all capture off. Buttons explicitly enable each device.
      if (epoch !== generation.current || !mounted.current) { await nextRoom.disconnect(true); return; }
      setRoom(nextRoom); setStatus('Conectado'); await nextRoom.startAudio();await current.playback.resume();if(outputDevice)try{await current.playback.output(outputDevice);}catch{await current.playback.output('');setError('Saída salva indisponível. Usando o padrão do Windows.');}
      current.joined=true;lastAck.current=Date.now();current.sounds.start();recovering.current=false;
    } catch (e) { if (active.current === current) await leave(retry); throw e; }
  }
  recoveryJoin.current=async(next,mic)=>{try{await join(next,true);if(mic&&active.current?.channel.id===next.id)try{await toggleMicrophone();}catch{setError('Chamada recuperada. Ligue o microfone quando estiver pronto.');}return true;}catch{if(recovering.current&&mounted.current){setChannel(next);setStatus('Reconectando…');}return false;}};
  useEffect(()=>{if(!room)return;let stopped=false,pending=false;const send=()=>{if(stopped||pending)return;const current=active.current;if(!current?.grant)return;pending=true;void window.discorda?.voiceActivity(current.grant.leaseId,room.localParticipant.isSpeaking&&room.localParticipant.isMicrophoneEnabled).catch(()=>{}).finally(()=>{pending=false;});};const timer=setInterval(send,700);return()=>{stopped=true;clearInterval(timer);};},[room]);
  useEffect(()=>{const track=active.current?.room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;if(track instanceof LocalAudioTrack)void track.applyConstraints({noiseSuppression:microphone.noiseSuppression!==false,echoCancellation:true,autoGainControl:true}).catch(()=>setError('Não foi possível alterar o filtro. Desligue e ligue o microfone.'));},[microphone.noiseSuppression]);
  useEffect(()=>{if(!room)return;let alive=true,pending=false;const refresh=async()=>{if(pending)return;pending=true;try{const devices=await navigator.mediaDevices.enumerateDevices();if(!alive)return;setDevices(devices);await active.current?.playback?.resume();if(outputDevice&&!devices.some(d=>d.kind==='audiooutput'&&d.deviceId===outputDevice)){await active.current?.playback?.output('');setOutputDevice('');localStorage.setItem('discorda:output','');setError('Fones desconectados. Som transferido para a saída padrão do Windows.');}const track=room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;const input=track instanceof LocalAudioTrack?track.getSourceTrackSettings().deviceId||microphone.deviceId:'';if(track instanceof LocalAudioTrack&&input&&!devices.some(d=>d.kind==='audioinput'&&d.deviceId===input)){await track.mute();configureMicrophone({...microphone,deviceId:''});await room.switchActiveDevice('audioinput','default');setError('Microfone desconectado. Padrão do Windows selecionado e silenciado; clique para ligar.');}}catch{if(alive)setError('Dispositivo indisponível. Selecione outra entrada ou saída.');}finally{pending=false;}};navigator.mediaDevices.addEventListener('devicechange',refresh);return()=>{alive=false;navigator.mediaDevices.removeEventListener('devicechange',refresh);};},[room,outputDevice,microphone]);
  const local = room?.localParticipant;
  const participants = room ? [room.localParticipant, ...room.remoteParticipants.values()] : [];
  const tiles = participants.flatMap<{key:string;participant:Participant;track:Track|undefined;screen:boolean}>(p => {const tracks=[...p.videoTrackPublications.values()].filter(t=>t.track&&!t.isMuted);return tracks.length ? tracks.map(pub=>({key:p.identity+':'+pub.source,participant:p,track:pub.track!,screen:pub.source===Track.Source.ScreenShare})) : [{key:p.identity+':avatar',participant:p,track:undefined,screen:false}];});
  const focus = tiles.find(t=>t.key===pinned) ?? (prioritizeScreen ? tiles.find(t=>t.screen&&!t.participant.isLocal) ?? tiles.find(t=>t.screen) : undefined);
  const ordered = (focus ? [focus,...tiles.filter(t=>t!==focus)] : tiles).filter(t=>t.track);
  const videoKeys=ordered.map(t=>t.key).sort().join('|'),previousVideos=useRef<string[]>([]);
  useEffect(()=>{const keys=videoKeys?videoKeys.split('|'):[];if(keys.some(key=>!previousVideos.current.includes(key)))setOpen(true);else if(!keys.length&&previousVideos.current.length)setOpen(false);previousVideos.current=keys;},[videoKeys,setOpen]);
  async function toggleMicrophone() {
    const current=active.current;if(!current)return;
    const published=current.room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    if(published){if(published.isMuted){await current.audioContext?.resume();await published.unmute();}else{await published.mute();setLevel({db:-90,open:false});}return;}
    const track=await createLocalAudioTrack({deviceId:microphone.deviceId||undefined,autoGainControl:true,echoCancellation:true,noiseSuppression:microphone.noiseSuppression!==false});
    const context=new AudioContext();current.audioContext=context;track.setAudioContext(context);
    try{await track.setProcessor(processor);if(active.current!==current){track.stop();await context.close();return;}await current.room.localParticipant.publishTrack(track,{source:Track.Source.Microphone});}
    catch(e){track.stop();await processor.destroy();if(context.state!=='closed')await context.close();throw e;}
  }
  async function refreshDevices() { setDevices(await Room.getLocalDevices(undefined, false)); }
  async function share(source: CaptureSource) {
    const current=active.current;if(!current)return;
    const options=screenOptions(quality,fps,intent);
    await window.discorda!.selectCapture(source.id,false);
    await current.room.localParticipant.setScreenShareEnabled(true,options.capture,options.publish);
    if(active.current!==current){await current.room.localParticipant.setScreenShareEnabled(false);return;}
    if(screenAudio){
      try{
        const stop=await shareApplicationAudio(current.room,excludeBrowsers?'system-no-browser':'system',()=>{if(mounted.current)setError('O áudio do PC foi interrompido. Pare e reinicie o compartilhamento para tentar novamente.');});
        if(active.current!==current || !current.room.localParticipant.isScreenShareEnabled)await stop();else applicationStop.current=stop;
      }catch(error){setError('Tela sem som: '+(error instanceof Error?error.message:'Não foi possível iniciar a captura do PC.'));}
    }
    setSources(undefined);
  }

  const shortcutHandler=useRef<(value:'mute'|'unavailable'|boolean)=>void>(()=>{});
  shortcutHandler.current=value=>{if(typeof value==='boolean')processor.talk(value);else if(value==='unavailable'){processor.talk(false);setError('Pressionar para falar indisponível. Reative os atalhos ou reinstale o aplicativo; o microfone permanece protegido pelo modo pressionar para falar.');}else if(active.current&&!deaf&&!testing)void perform(toggleMicrophone);};
  useEffect(()=>{const off=window.discorda?.onShortcut?.(value=>shortcutHandler.current(value));return()=>{off?.();void window.discorda?.shortcuts?.({...shortcuts,enabled:false});};},[]);
  useEffect(()=>{processor.configure({...microphone,pushToTalk:shortcuts.enabled&&shortcuts.pushToTalk});try{localStorage.setItem('discorda:shortcuts',JSON.stringify(shortcuts));}catch{}void window.discorda?.shortcuts?.({...shortcuts,enabled:shortcuts.enabled&&!!room}).catch(e=>setError(e instanceof Error?e.message:'Atalhos indisponíveis.'));},[shortcuts,room]);
  const moderationHandler=useRef<(destination:string|null)=>Promise<void>>(async()=>{});
  moderationHandler.current=async destination=>{const next=channels.find(c=>c.id===destination);await leave();if(next){await join(next);setError('Você foi movido por um moderador. Seu microfone está silenciado.');}else setError('Você foi removido da chamada por um moderador.');};
  useEffect(()=>window.discorda?.onLiveEvent(e=>{if(e.kind==='moderation'&&e.data.userId===userId)void moderationHandler.current(e.data.channelId).catch(()=>setError('A chamada foi alterada. Entre novamente na sala indicada.'));}),[userId]);
  async function chooseScreen(){
    if(local?.isScreenShareEnabled){await stopApplication();await local.setScreenShareEnabled(false);return;}
    setSources(await window.discorda!.captureSources());setAudioError('');
    try{const result=await window.discorda!.audioStatus();setAudioSupported(result.supported);if(!result.supported){setScreenAudio(false);setAudioError('Captura automática indisponível neste Windows. Nesta versão, compartilhar som do PC requer Windows 11.');}}
    catch{setAudioSupported(false);setScreenAudio(false);setAudioError('Componente de áudio indisponível. Reinstale a versão atual do Discorda e tente novamente.');}
  }
  return <section className="voice-sidebar" aria-label="Canais de voz">
    <div className="chat-channel-label">VOZ</div>
    <nav>{channels.map(item=><div key={item.id}><button disabled={busy||testing} className={channel?.id===item.id?'selected':''} onClick={()=>void perform(()=>join(item))}><Volume2 size={17}/>{item.name}<small>{(rosterByChannel.get(item.id)??[]).length||''}</small></button><ul className="voice-roster">{(rosterByChannel.get(item.id)??[]).map(p=><li key={p.userId} className={(participants.find(participant=>participant.identity===p.leaseId)?.isSpeaking||(speakers[p.leaseId??'']?.speaking&&speakers[p.leaseId??''].until>Date.now()))?'is-speaking':''}><button aria-label={p.name} disabled={p.userId===userId} title={p.userId===userId?'Você':'Clique com o botão direito para ajustar o volume'} onClick={e=>openVolume(p.userId,p.name,e.clientX,e.clientY)} onContextMenu={e=>{e.preventDefault();if(p.userId!==userId)openVolume(p.userId,p.name,e.clientX,e.clientY);}}><span className="voice-member-photo"><Avatar url={presenceById.get(p.userId)?.avatarUrl} name={p.name}/></span><span className="voice-member-name">{p.name}</span></button></li>)}</ul></div>)}</nav>
    {rosterError&&<small className="voice-error">Participantes indisponíveis.</small>}
    {room&&active.current?.playback&&participants.filter(p=>!p.isLocal).map(p=><RemoteAudio key={p.identity} participant={p as RemoteParticipant} playback={active.current!.playback!} deaf={deaf} volume={volumes[memberKey(p)]??defaultVolume} revision={revision}/>)}
    {dockHost&&createPortal(<div className="voice-dock compact-dock">
      {channel&&<><div className="call-status"><span className="ping-indicator" tabIndex={0} title={ping===undefined?'Medindo latência da chamada…':'Ping da chamada: '+ping+' ms'} aria-label={ping===undefined?'Medindo ping':'Ping: '+ping+' ms'}><Signal size={20}/><span className="ping-tooltip">{ping===undefined?'Medindo…':ping+' ms'}</span></span><div><strong>{status==='Conectado'?'Voz conectada':status}</strong><small>{channel.name}</small></div><button title="Desconectar" aria-label="Sair da chamada" className="disconnect-button" onClick={()=>void leave()}><PhoneOff size={18}/></button></div>
      <div className="broadcast-controls"><button disabled={!local||busy} aria-pressed={!!local?.isCameraEnabled} title={local?.isCameraEnabled?'Desligar câmera':'Ligar câmera'} aria-label={local?.isCameraEnabled?'Desligar câmera':'Ligar câmera'} onClick={()=>void perform(()=>local!.setCameraEnabled(!local!.isCameraEnabled))}>{local?.isCameraEnabled?<Video size={21}/>:<VideoOff size={21}/>}<span>Câmera</span></button><button disabled={!local||busy} aria-pressed={!!local?.isScreenShareEnabled} title={local?.isScreenShareEnabled?'Encerrar transmissão':'Compartilhar tela'} aria-label={local?.isScreenShareEnabled?'Parar tela':'Compartilhar tela'} onClick={()=>void perform(chooseScreen)}><MonitorUp size={21}/><span>{local?.isScreenShareEnabled?'Parar tela':'Tela'}</span></button></div></>}
      <UpdateNotice onOpen={()=>{setSettingsTab('updates');setAudioSettings(true);}}/>{error&&<p className="voice-error" role="alert">{error}</p>}
      <div className="personal-controls"><div className="self-profile"><Avatar url={self?.avatarUrl} name={self?.name??'Você'}/><span><strong title={self?.name}>{self?.name??'Você'}</strong><small>{channel?'Em voz':'Disponível'}</small></span></div><div className="split-control"><button disabled={!local||busy||deaf||testing} className={local?.isMicrophoneEnabled?'':'is-off'} title={local?.isMicrophoneEnabled?'Silenciar microfone':'Ligar microfone'} aria-label={local?.isMicrophoneEnabled?'Silenciar microfone':'Ligar microfone'} onClick={()=>void perform(toggleMicrophone)}>{local?.isMicrophoneEnabled?<Mic size={18}/>:<MicOff size={18}/>}</button><button aria-label="Selecionar microfone" aria-expanded={deviceMenu==='audioinput'} onClick={()=>{setDeviceMenu(deviceMenu==='audioinput'?undefined:'audioinput');void refreshDevices().catch(()=>setError('Não foi possível listar microfones.'));}}>{deviceMenu==='audioinput'?<ChevronDown size={12}/>:<ChevronUp size={12}/>}</button></div><div className="split-control"><button disabled={!local||busy} title={deaf?'Voltar a ouvir':'Ensurdecer'} aria-label={deaf?'Voltar a ouvir':'Ensurdecer'} aria-pressed={deaf} onClick={()=>void perform(async()=>{if(!deaf)await local!.setMicrophoneEnabled(false);setDeaf(!deaf);})}>{deaf?<VolumeX size={18}/>:<Headphones size={18}/>}</button><button aria-label="Selecionar saída de áudio" aria-expanded={deviceMenu==='audiooutput'} onClick={()=>{setDeviceMenu(deviceMenu==='audiooutput'?undefined:'audiooutput');void refreshDevices().catch(()=>setError('Não foi possível listar saídas de áudio.'));}}>{deviceMenu==='audiooutput'?<ChevronDown size={12}/>:<ChevronUp size={12}/>}</button></div><button title="Configurações" aria-label="Ajustar microfone" onClick={()=>{setDeviceMenu(undefined);setSettingsTab('audio');setAudioSettings(true);void refreshDevices().catch(()=>{});}}><Settings size={18}/></button></div>
      {channel&&<button className="call-navigation" aria-label="Mostrar chamada" onClick={()=>setOpen(!open)}>{open?<MessageSquare size={13}/>:<MonitorUp size={13}/>} {open?'Voltar ao chat':'Ver chamada'}</button>}
      {deviceMenu&&<div className="device-menu" onKeyDown={event=>{if(event.key==='Escape'){setDeviceMenu(undefined);}}} role="dialog" aria-label={deviceMenu==='audioinput'?'Dispositivo de entrada':'Dispositivo de saída'}><div><strong>{deviceMenu==='audioinput'?'Microfone':'Saída de áudio'}</strong><button aria-label="Fechar dispositivos" onClick={()=>setDeviceMenu(undefined)}><X size={15}/></button></div><select aria-label={deviceMenu==='audioinput'?'Escolher microfone':'Escolher saída'} value={deviceMenu==='audioinput'?microphone.deviceId:outputDevice} onChange={e=>void perform(()=>chooseDevice(deviceMenu,e.target.value))}><option value="">Padrão do Windows</option>{devices.filter(d=>d.kind===deviceMenu&&d.deviceId).map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'Dispositivo de áudio'}</option>)}</select></div>}
    </div>,dockHost)}
    {mediaHost&&room&&createPortal(<section className="voice-panel" role="region" aria-label={'Chamada '+(channel?.name??'')}>
      <header><div><h2>{channel?.name??'Chamada'}</h2><small>{participants.length} participante(s)</small></div><button onClick={()=>setOpen(false)}><MessageSquare size={16}/> Voltar ao chat</button></header>
      {!!ordered.length&&<div className="voice-view-options"><label><input type="checkbox" checked={prioritizeScreen} onChange={e=>setPrioritizeScreen(e.target.checked)}/> Priorizar tela</label>{pinned&&<button onClick={()=>setPinned(undefined)}>Desafixar</button>}<button onClick={e=>void e.currentTarget.closest('section')?.requestFullscreen()}>Tela cheia</button></div>}
      {ordered.length?<div className={'voice-grid'+(focus?' has-focus':'')}>{ordered.map(tile=><ParticipantTile key={tile.key} participant={tile.participant} track={tile.track} screen={tile.screen} focused={focus===tile} pinned={pinned===tile.key} pin={()=>setPinned(pinned===tile.key?undefined:tile.key)} onVolume={e=>openVolume(memberKey(tile.participant),tile.participant.name||'Participante',e.clientX,e.clientY)}/>)}</div>:<div className="call-empty"><Headphones size={36}/><h2>Vocês estão na mesma sala.</h2><p>A conversa continua enquanto você navega pelo chat.<br/>Câmeras e telas compartilhadas aparecem aqui.</p><button onClick={()=>setOpen(false)}>Ir para o chat</button></div>}
    </section>,mediaHost)}
    {sources&&createPortal(<Modal className="capture-modal" label="Compartilhar tela" onClose={()=>setSources(undefined)}><section className="capture-picker"><div className="capture-title"><div><h2>Compartilhar tela</h2><p>Escolha uma janela ou um monitor.</p></div><button aria-label="Cancelar compartilhamento" onClick={()=>setSources(undefined)}><X size={20}/></button></div><div className="capture-options"><label>Conteúdo<select aria-label="Perfil de transmissão" value={intent} onChange={e=>{const next=e.target.value as ScreenIntent;setIntent(next);setFps(next==='text'?30:60);}}><option value="auto">Automático · equilíbrio</option><option value="games">Jogos · fluidez</option><option value="text">Texto · nitidez</option></select></label><label>Resolução<select value={quality} onChange={e=>setQuality(e.target.value as keyof typeof screenProfiles|'auto')}><option value="auto">Automático · até 1080p</option>{Object.keys(screenProfiles).map(q=><option key={q} value={q}>{q==='2160'?'4K':q+'p'}</option>)}</select></label><label>Fluidez<select value={fps} onChange={e=>setFps(Number(e.target.value) as 30|60)}><option value="60">60 fps</option><option value="30">30 fps</option></select></label></div><label className="share-sound"><input type="checkbox" checked={screenAudio} onChange={e=>{if(audioSupported)setScreenAudio(e.target.checked);else setAudioError('Nesta versão, a captura automática de som precisa do Windows 11.');}}/>Compartilhar som do PC<span>Discord e Discorda ficam fora</span></label>{audioError&&<p className="voice-error" role="status">{audioError}</p>}{screenAudio&&<label className="exclude-browsers"><input type="checkbox" checked={excludeBrowsers} onChange={e=>setExcludeBrowsers(e.target.checked)}/> Também excluir navegadores (para quem usa Discord web)</label>}<p className="capture-note">O áudio dos aplicativos é detectado automaticamente. Notificações do Windows sem aplicativo identificado ficam fora.</p><div className="capture-grid">{sources.map(source=><button disabled={busy} key={source.id} onClick={()=>void perform(()=>share(source))}><img src={source.thumbnail} alt=""/><span>{source.name}</span></button>)}</div></section></Modal>,document.body)}
    {audioSettings&&createPortal(<SettingsDialog initialTab={settingsTab} onClose={()=>setAudioSettings(false)} audio={<><AudioSetup output={outputDevice}/><MicrophoneControls output={outputDevice} settings={microphone} change={configureMicrophone} callActive={!!local?.isMicrophoneEnabled} level={level} onTesting={setTesting}/><ShortcutControls value={shortcuts} change={setShortcuts}/><div className="voice-settings"><h3>Sons da chamada</h3><label>Volume dos avisos <output>{soundVolume}%</output><input aria-label="Volume dos avisos" type="range" min="0" max="100" step="5" value={soundVolume} onChange={e=>{const value=Number(e.target.value);setSoundVolume(value);try{localStorage.setItem('discorda:call-sounds',String(value));}catch{}}}/></label><p>Entrada, saída e compartilhamento de tela. Use 0% para silenciar. Ensurdecer também silencia os avisos.</p></div></>} devices={<><DevicePermissions/><div className="voice-settings"><h3>Dispositivos</h3><button disabled={!room} onClick={()=>void active.current?.playback?.notify('join',50)}>Testar som nos fones</button>{(['audioinput','audiooutput','videoinput'] as const).map(kind=><label key={kind}>{kind==='audioinput'?'Microfone':kind==='audiooutput'?'Fones / saída de som':'Câmera'}<select aria-label={kind} value={kind==='audioinput'?microphone.deviceId:kind==='audiooutput'?outputDevice:undefined} disabled={busy||(kind==='videoinput'&&!room)} onChange={e=>{const value=e.target.value;void perform(async()=>{if(kind==='videoinput')await room!.switchActiveDevice(kind,value);else await chooseDevice(kind,value);});}}><option value="">Padrão do Windows</option>{devices.filter(d=>d.kind===kind).map((d,i)=><option key={d.deviceId||i} value={d.deviceId}>{d.label||'Dispositivo '+(i+1)}</option>)}</select></label>)}<p>Microfone e fones podem ser escolhidos antes da chamada. A câmera requer uma sala conectada.</p></div></>} diagnostics={<Diagnostics voice={status} reconnect={()=>{if(active.current)void recoverCall();else recovery.current.retryNow();}}/>} updates={<UpdateControls/>}/>,document.body)}
    {volumeMenu&&createPortal(<div ref={menuRef} className="member-volume-menu" role="dialog" aria-label={'Volume de '+volumeMenu.name} style={{left:volumeMenu.x,top:volumeMenu.y}}><div><strong>{volumeMenu.name}</strong><button aria-label="Fechar volume" onClick={()=>setVolumeMenu(undefined)}><X size={15}/></button></div>{(['voice','screen'] as const).map(kind=><label key={kind}>{kind==='voice'?'Voz':'Som compartilhado'}<output>{(volumes[volumeMenu.id]??defaultVolume)[kind]}%</output><input aria-label={kind==='voice'?'Volume da voz':'Volume do compartilhamento'} type="range" min="0" max="400" step="5" value={(volumes[volumeMenu.id]??defaultVolume)[kind]} onChange={e=>changeVolume(volumeMenu.id,kind,Number(e.target.value))}/></label>)}<small>Só altera o volume para você.</small><button onClick={()=>{changeVolume(volumeMenu.id,'voice',150);changeVolume(volumeMenu.id,'screen',100);}}>Restaurar padrão</button></div>,document.body)}
  </section>;
}

function ParticipantTile({ participant:p,track,screen,focused,pinned,pin,onVolume }: { participant:Participant;track:Track|undefined;screen:boolean;focused:boolean;pinned:boolean;pin:()=>void;onVolume:(event:React.MouseEvent)=>void }) {
  const tile=useRef<HTMLDivElement>(null);const [fullscreen,setFullscreen]=useState(false);
  useEffect(()=>{const changed=()=>setFullscreen(document.fullscreenElement===tile.current);document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
  return <div ref={tile} onContextMenu={e=>{if(!p.isLocal){e.preventDefault();onVolume(e);}}} className={`participant-tile ${p.isSpeaking?'speaking':''} ${focused?'focused':''}`}>
    {track?<TrackVideo track={track} screen={screen} publication={!p.isLocal?p.getTrackPublication(screen?Track.Source.ScreenShare:Track.Source.Camera) as RemoteTrackPublication:undefined}/>:<div className="voice-avatar">{(p.name||'?').slice(0,1).toUpperCase()}</div>}
    <div className="participant-caption"><span>{p.name||'Participante'}{p.isLocal?' (você)':''}{screen?' · Tela':''}</span>{!p.isMicrophoneEnabled&&<MicOff size={14}/>}<small>{p.connectionQuality==='poor'?'Conexão fraca':p.isSpeaking?'Falando':''}</small></div>
    <div className="tile-controls"><StreamWindow track={track} name={(p.name||'Participante')+(screen?' · Tela':' · Câmera')}/>{!p.isLocal&&<button aria-label={'Ajustar volume de '+(p.name||'Participante')} onClick={onVolume}><Volume2 size={14}/> Volume</button>}<button onClick={pin} aria-pressed={pinned}>{pinned?'Desafixar':'Fixar'} {screen?'tela':'exibição'}</button><button onClick={()=>void(fullscreen?document.exitFullscreen():tile.current!.requestFullscreen()).catch(()=>{})}>{fullscreen?'Sair da tela cheia':'Tela cheia'}</button></div>
  </div>;
}
function TrackVideo({ track, screen,publication }: { track: Track; screen: boolean;publication?:RemoteTrackPublication }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [statistics,setStatistics]=useState('');
  const [receiveQuality,setReceiveQuality]=useState('auto');
  const [health,setHealth]=useState<ReturnType<typeof videoHealth>>();
  useEffect(()=>{if(!screen||!(track instanceof RemoteVideoTrack||track instanceof LocalVideoTrack))return;let active=true,pending=false,previous:VideoSample|undefined;
    const sample=async()=>{if(pending)return;pending=true;try{const report=await track.getRTCStatsReport();const stats=report?[...report.values()].find(r=>(r.type==='inbound-rtp'||r.type==='outbound-rtp')&&(r.kind==='video'||r.mediaType==='video')):undefined;if(!active||!stats)return;const current:VideoSample={timestamp:stats.timestamp,bytes:stats.bytesReceived??stats.bytesSent??0,received:stats.packetsReceived??stats.packetsSent??0,lost:stats.packetsLost??0,frames:stats.framesDecoded??stats.framesEncoded??0,dropped:stats.framesDropped??0,jitter:stats.jitter??0,limitation:stats.qualityLimitationReason};setHealth(videoHealth(current,previous));previous=current;}catch{}finally{pending=false;}};void sample();const timer=setInterval(()=>void sample(),2000);return()=>{active=false;clearInterval(timer);};},[track,screen]);

  useEffect(()=>{if(!screen)return;let frames=ref.current?.getVideoPlaybackQuality().totalVideoFrames??0,time=performance.now();const timer=setInterval(()=>{const video=ref.current;if(!video)return;const now=performance.now(),total=video.getVideoPlaybackQuality().totalVideoFrames;setStatistics(video.videoWidth+' × '+video.videoHeight+' · '+Math.round((total-frames)*1000/(now-time))+' fps em exibição');frames=total;time=now;},2000);return()=>clearInterval(timer);},[screen,track]);
  useEffect(() => { const el = ref.current!; track.attach(el);const resume=()=>{if(track.mediaStreamTrack.readyState==='live'&&el.srcObject)void el.play().catch(()=>{});};el.addEventListener('pause',resume);return () => {el.removeEventListener('pause',resume);track.detach(el);}; }, [track]);
  return <><video ref={ref} autoPlay playsInline muted controls={false} disablePictureInPicture disableRemotePlayback controlsList="nodownload noplaybackrate noremoteplayback" onContextMenu={e=>e.preventDefault()} className={screen ? 'screen-video' : ''} onDoubleClick={e => void e.currentTarget.requestFullscreen().catch(() => {})}/>{screen&&<div className="screen-statistics"><span>{statistics}{health?' · '+health.mbps.toFixed(1)+' Mbps':''}</span><details><summary>Qualidade da transmissão</summary>{publication&&<label>Qualidade para você<select aria-label="Qualidade recebida" disabled={!publication.simulcasted} title={publication.simulcasted?'Limite de qualidade para você':'Quem transmite enviou uma única qualidade. Peça o perfil Automático para receber opções.'} value={receiveQuality} onChange={e=>{const value=e.target.value;setReceiveQuality(value);publication.setVideoQuality(value==='low'?VideoQuality.LOW:value==='medium'?VideoQuality.MEDIUM:VideoQuality.HIGH);}}><option value="auto">Automática / melhor disponível</option><option value="medium">Economizar · camada intermediária</option><option value="low">Economizar mais · camada baixa</option></select></label>}<p>{health?.hint??'Coletando métricas…'}</p>{health&&<p>Perda: {health.loss.toFixed(1)}% · Quadros descartados: {health.drop.toFixed(1)}% · Variação: {health.jitterMs.toFixed(0)} ms</p>}<small>Depende das camadas enviadas e da conexão. As métricas mostram indícios, não um diagnóstico definitivo.</small></details></div>}</>;
}
function RemoteAudio({ participant, deaf, revision,playback,volume }: { participant: RemoteParticipant; deaf: boolean; revision: number;playback:VoicePlayback;volume:MemberVolume }) {
  void revision;
  return <>{[...participant.audioTrackPublications.values()].filter(p=>p.track).map(p=><AudioTrack key={p.trackSid} track={p.track! as RemoteAudioTrack} playback={playback} volume={deaf?0:volume[p.source===Track.Source.ScreenShareAudio?'screen':'voice']}/>)}</>;
}
function AudioTrack({track,playback,volume}:{track:RemoteAudioTrack;playback:VoicePlayback;volume:number}){
 const ref=useRef<HTMLAudioElement>(null),connection=useRef<ReturnType<VoicePlayback['attach']>|undefined>(undefined);
 useEffect(()=>{const attached=playback.attach(track,ref.current!,volume);connection.current=attached;return()=>{attached.stop();connection.current=undefined;};},[track,playback]);
 useEffect(()=>{connection.current?.volume(volume);},[volume]);
 return <audio ref={ref} autoPlay muted/>;
}
