import {TemporaryRoom} from './TemporaryRoom';
import {comparePeople} from './voice-order';
import {CallCheck} from './CallCheck';
import {scopedKey} from '../../lib/server-scope';
import {StreamWindow} from './StreamWindow';
import { mediaErrorMessage } from './media-errors';
import {videoHealth,type VideoSample} from './media-quality';
import {Modal} from '../../components/ui/modal';
import {AudioSetup,ShortcutControls,readShortcuts} from './AudioSetup';
import { Diagnostics } from './Diagnostics';
import { SettingsDialog } from './SettingsDialog';
import { useEffect, useRef, useState, useMemo, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Room, RoomEvent, TrackEvent, Track, RemoteVideoTrack, LocalVideoTrack, VideoQuality, type RemoteTrackPublication, LocalAudioTrack, createLocalAudioTrack, type Participant, type RemoteAudioTrack, type RemoteParticipant } from 'livekit-client';
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

type Channel = { id: string; name: string; temporary?:boolean };
export function Voice({ presence=[], channels, userId, mediaHost, dockHost, open, setOpen, account, self }: { presence?:PresenceMember[];channels:Channel[];self?:PresenceMember;userId?:string;mediaHost:HTMLElement|null;dockHost:HTMLElement|null;open:boolean;setOpen:(open:boolean)=>void;account:ReactNode }) {
  const [roster, setRoster] = useState<VoiceMember[]>([]);
  const [speakers,setSpeakers]=useState<Record<string,{speaking:boolean;until:number}>>({});
  useEffect(()=>{const off=window.discorda?.onLiveEvent(event=>{if(event.kind==='voice')setSpeakers(previous=>({...previous,[event.data.leaseId]:{speaking:event.data.speaking,until:Date.now()+2500}}));});const timer=setInterval(()=>setSpeakers(previous=>Object.fromEntries(Object.entries(previous).filter(([,s])=>s.until>Date.now()))),1000);return()=>{off?.();clearInterval(timer);};},[]);
  const [rosterError, setRosterError] = useState(false);
  const [audioSettings, setAudioSettings] = useState(false);
  const [settingsTab,setSettingsTab]=useState<'audio'|'updates'|'diagnostics'>('audio');
  const [testing, setTesting] = useState(false);
  const [microphone, setMicrophone] = useState(readMicrophoneSettings);
  const [level, setLevel] = useState({db:-90,open:false});
  const [shortcutError,setShortcutError]=useState('');
  const [shortcuts,setShortcuts]=useState(readShortcuts);
  const [processor] = useState(() => new MicrophoneProcessor(microphone));
  const [cinema,setCinema]=useState(false);
  const [multi,setMulti]=useState(false);
  const [hiddenScreens,setHiddenScreens]=useState<string[]>([]);
  const [creatingRoom,setCreatingRoom]=useState(false);
  useEffect(()=>{if(!cinema)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setCinema(false);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[cinema]);
  const [pinned, setPinned] = useState<string>();
  const [prioritizeScreen, setPrioritizeScreen] = useState(true);
  function configureMicrophone(settings: MicrophoneSettings) {setMicrophone(settings);processor.configure({...settings,pushToTalk:shortcuts.enabled&&shortcuts.pushToTalk});try{localStorage.setItem('discorda:microphone',JSON.stringify(settings));}catch{/* In-memory preferences still work. */}}
  useEffect(()=>{processor.onLevel=setLevel;return()=>{processor.onLevel=undefined;};},[processor]);
  useEffect(()=>{
    let alive=true, fetching=false;
    const load=async()=>{if(fetching)return;fetching=true;try{const result=await window.discorda!.chat({kind:'voiceRoster'});if(alive){setRoster(result.ok&&Array.isArray(result.data)?result.data as VoiceMember[]:[]);setRosterError(!result.ok);}}catch{if(alive){setRoster([]);setRosterError(true);}}finally{fetching=false;}};
    const off=window.discorda?.onLiveEvent(e=>{if(e.kind==='voiceRoster'){setRoster(e.data);setRosterError(false);}else if(e.kind==='connection'&&e.data==='connected')void load();});
    void load();const timer=setInterval(()=>void load(),4000);return()=>{alive=false;clearInterval(timer);off?.();};
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
  const [shareMenu,setShareMenu]=useState(false),[sharingAudio,setSharingAudio]=useState(false);
  const shareMenuRef=useRef<HTMLDivElement>(null),shareButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!shareMenu)return;
    shareMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss=(event:PointerEvent)=>{if(!shareMenuRef.current?.contains(event.target as Node)&&!shareButton.current?.contains(event.target as Node))setShareMenu(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setShareMenu(false);shareButton.current?.focus();}};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
  },[shareMenu]);
  const [volumes,setVolumes]=useState(readVolumes);
  const [volumeMenu,setVolumeMenu]=useState<{id:string;name:string;x:number;y:number}>();
  const menuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!volumeMenu)return;const dismiss=(e:PointerEvent)=>{if(!menuRef.current?.contains(e.target as Node))setVolumeMenu(undefined);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setVolumeMenu(undefined);};document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};},[volumeMenu]);
  function changeVolume(id:string,kind:keyof MemberVolume,value:number){setVolumes(previous=>{const next={...previous,[id]:{...(previous[id]??defaultVolume),[kind]:value}};try{localStorage.setItem(scopedKey('member-volumes'),JSON.stringify(next));}catch{}return next;});}
  const rosterByLease=useMemo(()=>new Map(roster.map(r=>[r.leaseId,r.userId])),[roster]);
  const presenceById=useMemo(()=>new Map(presence.map(p=>[p.id,p])),[presence]);
  const rosterByChannel=useMemo(()=>{const map=new Map<string,VoiceMember[]>();
    // LiveKit owns the current room; REST recovers rosters for other rooms.
    const entries=room&&channel?roster.filter(p=>p.channelId!==channel.id&&p.userId!==userId):roster.filter(p=>p.userId!==userId);
    if(room&&channel)for(const p of [room.localParticipant,...room.remoteParticipants.values()])entries.push({channelId:channel.id,userId:p.isLocal?userId??p.identity:memberKey(p),leaseId:p.identity,name:p.name||(p.isLocal?self?.name:undefined)||'Participante'});
    for(const member of entries){const group=map.get(member.channelId)??[];group.push(member);map.set(member.channelId,group);}for(const group of map.values())group.sort((a,b)=>comparePeople(a.name,a.userId,b.name,b.userId));return map;
  },[roster,room,channel,userId,revision,self?.name,rosterByLease]);
  function memberKey(p:Participant){if(p.isLocal)return userId??p.identity;try{const id=JSON.parse(p.metadata??'{}').userId;if(typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id))return id;}catch{}return rosterByLease.get(p.identity)??p.identity;}
  function openVolume(id:string,name:string,x:number,y:number){setVolumeMenu({id,name,x:Math.max(8,Math.min(x,window.innerWidth-284)),y:Math.max(8,Math.min(y,window.innerHeight-258))});}
  const applicationStop=useRef<(()=>Promise<void>)|undefined>(undefined);
  async function stopApplication(){const stop=applicationStop.current;applicationStop.current=undefined;if(mounted.current)setSharingAudio(false);await stop?.();}
  const active = useRef<{ room: Room; channel: Channel; joined?:boolean; grant?: MediaGrant; audioContext?: AudioContext; playback?:VoicePlayback; sounds?:ReturnType<typeof bindCallSounds> } | undefined>(undefined);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const recovery=useRef(new CallRecovery());
  const endedMicrophones=useRef(new WeakSet<LocalAudioTrack>());
  const recoveryJoin=useRef<(next:Channel,mic:boolean)=>Promise<boolean>>(async()=>false);
  const lastAck=useRef(0),recovering=useRef(false);
  async function recoverCall(){
    const current=active.current;if(!current||recovering.current)return;
    recovering.current=true;const target=current.channel,mic=current.room.localParticipant.isMicrophoneEnabled&&!soundPreferences.current.deaf;
    const cleanup=leave(true);const ticket=generation.current;await cleanup.catch(()=>{});
    if(!mounted.current||generation.current!==ticket)return;
    setChannel(target);setStatus('Reconectando…');
    recovery.current.start(()=>recoveryJoin.current(target,mic),()=>{recovering.current=false;setChannel(undefined);setStatus('');setError('Não foi possível recuperar a chamada. Entre novamente quando a conexão voltar.');},(attempt,delay)=>{if(mounted.current){setChannel(target);setStatus(!navigator.onLine?'Sem rede · aguardando conexão':delay?`Reconectando · nova tentativa em ${delay/1000}s`:`Reconectando · tentativa ${attempt} de 8`);}},()=>navigator.onLine);
  }
  async function leave(preserveRecovery=false) {
    if(!preserveRecovery){recovery.current.cancel();recovering.current=false;}
    generation.current++;
    const current = active.current; active.current = undefined;
    if (mounted.current) { setHiddenScreens([]);setCinema(false);setRoom(undefined); setChannel(undefined); setOpen(false); setSources(undefined);setShareMenu(false); if(!preserveRecovery)setDeaf(false); setStatus(''); setPinned(undefined); setLevel({db:-90,open:false}); }
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
    const offPower=window.discorda?.onPowerState?.(state=>{if(state==='suspend'){if(active.current)void recoverCall();}else{online();void active.current?.audioContext?.resume().catch(()=>{});void window.discorda?.shortcuts(readShortcuts()).catch(()=>setError('Reative os atalhos nas configurações após a suspensão.'));}});
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
    return () => { mounted.current = false; offPower?.(); window.removeEventListener('online',online);clearInterval(pulse); void leave(); };
  }, []);
  async function perform(action: () => Promise<unknown>) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (error) { if (mounted.current) setError(mediaErrorMessage(error)); }
    finally { busyRef.current = false; if (mounted.current) { setBusy(false); update(x => x + 1); } }
  }
  async function join(next: Channel, retry=false) {
    if (active.current?.channel.id === next.id) { setOpen(true); return true; }
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
    nextRoom.on(RoomEvent.LocalTrackUnpublished,p=>{if(p.source===Track.Source.ScreenShare){setShareMenu(false);void stopApplication();}});
    nextRoom.on(RoomEvent.Reconnecting, () => { if (active.current === current) setStatus('Reconectando…'); });
    nextRoom.on(RoomEvent.Reconnected, () => { if (active.current === current) setStatus('Conectado'); });
    nextRoom.on(RoomEvent.MediaDevicesError,error=>{if(active.current===current)setError(mediaErrorMessage(error));});
    nextRoom.on(RoomEvent.SignalReconnecting,()=>{if(active.current===current)setStatus('Reconectando…');});
    nextRoom.on(RoomEvent.Disconnected, reason => { if (active.current === current && current.joined) { if(canRecover(reason))void recoverCall();else{void leave();if(mounted.current)setError('A chamada foi encerrada pelo servidor.');} } });
    try {
      const result = await window.discorda!.media({kind: 'join', channelId: next.id});
      if (!result.ok) {if(result.status===401||result.status===403){recovery.current.cancel();recovering.current=false;}throw new Error(result.message);}
      current.grant = result.data as MediaGrant;
      if (epoch !== generation.current || !mounted.current) {
        await window.discorda!.media({kind: 'leave', channelId: next.id, leaseId: current.grant.leaseId}); return false;
      }
      await nextRoom.connect(current.grant.url, current.grant.token);
      // Join with all capture off. Buttons explicitly enable each device.
      if (epoch !== generation.current || !mounted.current) { await nextRoom.disconnect(true); return false; }
      setRoom(nextRoom); if(!retry)setOpen(true); setStatus('Conectado'); await nextRoom.startAudio();await current.playback.resume();if(outputDevice)try{await current.playback.output(outputDevice);}catch{await current.playback.output('');setError('Saída salva indisponível. Usando o padrão do Windows.');}
      current.joined=true;void window.discorda?.media({kind:'ready',channelId:next.id,leaseId:current.grant.leaseId}).catch(()=>{});lastAck.current=Date.now();current.sounds.start();recovering.current=false;return true;
    } catch (e) { if (active.current === current) await leave(retry); throw e; }
  }
  recoveryJoin.current=async(next,mic)=>{try{if(!await join(next,true))return false;if(mic&&!soundPreferences.current.deaf&&active.current?.channel.id===next.id)try{await toggleMicrophone();}catch{setError('Chamada recuperada. Ligue o microfone quando estiver pronto.');}return true;}catch{return false;}};
  useEffect(()=>{if(!room)return;let stopped=false,pending=false;const send=()=>{if(stopped||pending)return;const current=active.current;if(!current?.grant)return;pending=true;void window.discorda?.voiceActivity(current.grant.leaseId,room.localParticipant.isSpeaking&&room.localParticipant.isMicrophoneEnabled).catch(()=>{}).finally(()=>{pending=false;});};const timer=setInterval(send,700);return()=>{stopped=true;clearInterval(timer);};},[room]);
  useEffect(()=>{const track=active.current?.room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;if(track instanceof LocalAudioTrack)void track.applyConstraints({noiseSuppression:microphone.noiseSuppression!==false,echoCancellation:true,autoGainControl:true}).catch(()=>setError('Não foi possível alterar o filtro. Desligue e ligue o microfone.'));},[microphone.noiseSuppression]);
  useEffect(()=>{if(!room)return;let alive=true,pending=false;const refresh=async()=>{if(pending)return;pending=true;try{const devices=await navigator.mediaDevices.enumerateDevices();if(!alive)return;setDevices(devices);await active.current?.playback?.resume();if(outputDevice&&!devices.some(d=>d.kind==='audiooutput'&&d.deviceId===outputDevice)){await active.current?.playback?.output('');setOutputDevice('');localStorage.setItem('discorda:output','');setError('Fones desconectados. Som transferido para a saída padrão do Windows.');}const track=room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;const input=track instanceof LocalAudioTrack?track.getSourceTrackSettings().deviceId||microphone.deviceId:'';if(track instanceof LocalAudioTrack&&input&&!devices.some(d=>d.kind==='audioinput'&&d.deviceId===input)){await track.mute();configureMicrophone({...microphone,deviceId:''});await room.switchActiveDevice('audioinput','default');setError('Microfone desconectado. Padrão do Windows selecionado e silenciado; clique para ligar.');}}catch{if(alive)setError('Dispositivo indisponível. Selecione outra entrada ou saída.');}finally{pending=false;}};navigator.mediaDevices.addEventListener('devicechange',refresh);return()=>{alive=false;navigator.mediaDevices.removeEventListener('devicechange',refresh);};},[room,outputDevice,microphone]);
  const local = room?.localParticipant;
  const participants = room ? [room.localParticipant, ...room.remoteParticipants.values()].sort((a,b)=>comparePeople(a.name??"",a.identity,b.name??"",b.identity)) : [];
  const participantsByLease=new Map(participants.map(p=>[p.identity,p]));
  const tiles = participants.flatMap<{key:string;participant:Participant;track:Track|undefined;screen:boolean}>(p => {const tracks=[...p.videoTrackPublications.values()].filter(t=>t.track&&!t.isMuted);return tracks.length ? tracks.map(pub=>({key:p.identity+':'+pub.source,participant:p,track:pub.track!,screen:pub.source===Track.Source.ScreenShare})) : [{key:p.identity+':avatar',participant:p,track:undefined,screen:false}];});
  const focus = multi ? undefined : tiles.find(t=>t.key===pinned) ?? (prioritizeScreen ? tiles.find(t=>t.screen&&!t.participant.isLocal) ?? tiles.find(t=>t.screen) : undefined);
  const hasScreens=tiles.some(t=>t.screen);
  const selectedTiles=tiles.filter(t=>(!cinema||!hasScreens||t.screen)&&(!t.screen||!hiddenScreens.includes(t.key)));
  const ordered = focus ? [focus,...selectedTiles.filter(t=>t!==focus)] : selectedTiles;
  async function toggleMicrophone() {
    const current=active.current;if(!current)return;
    let published=current.room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    if(published instanceof LocalAudioTrack&&endedMicrophones.current.has(published)){await current.room.localParticipant.unpublishTrack(published);published.stop();await processor.destroy();if(current.audioContext?.state!=='closed')await current.audioContext?.close();published=undefined;if(active.current!==current)return;}
    if(published){if(published.isMuted){await current.audioContext?.resume();await published.unmute();}else{await published.mute();setLevel({db:-90,open:false});}return;}
    const track=await createLocalAudioTrack({deviceId:microphone.deviceId||undefined,autoGainControl:true,echoCancellation:true,noiseSuppression:microphone.noiseSuppression!==false});
    track.once(TrackEvent.Ended,()=>{endedMicrophones.current.add(track);if(active.current===current){void track.mute().catch(()=>{});setLevel({db:-90,open:false});setError('O microfone foi desconectado ou interrompido. Reconecte-o ou selecione outra entrada e clique em Ligar microfone.');update(value=>value+1);}});
    const context=new AudioContext();current.audioContext=context;track.setAudioContext(context);
    try{await track.setProcessor(processor);if(active.current!==current){track.stop();await context.close();return;}await current.room.localParticipant.publishTrack(track,{source:Track.Source.Microphone});}
    catch(e){track.stop();await processor.destroy();if(context.state!=='closed')await context.close();throw e;}
  }
  async function refreshDevices() { setDevices(await Room.getLocalDevices(undefined, false)); }
  async function setSharedAudio(enabled:boolean){
    const current=active.current;if(!current||!current.room.localParticipant.isScreenShareEnabled)return;
    if(!enabled){await stopApplication();return;}
    if(applicationStop.current)return;
    const support=await window.discorda!.audioStatus();
    if(!support.supported)throw Error('Compartilhar som do PC requer Windows 11 nesta versão.');
    const stop=await shareApplicationAudio(current.room,excludeBrowsers?'system-no-browser':'system',()=>{
      if(active.current===current){applicationStop.current=undefined;setSharingAudio(false);setError('O som do PC foi interrompido. Use as opções de Parar tela para ativá-lo novamente.');}
    });
    if(active.current!==current||!current.room.localParticipant.isScreenShareEnabled)await stop();
    else{applicationStop.current=stop;setSharingAudio(true);}
  }
  async function share(source: CaptureSource) {
    const current=active.current;if(!current)return;
    const existing=current.room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track;
    const options=screenOptions(quality,fps,intent);
    await window.discorda!.selectCapture(source.id,false);
    if(existing instanceof LocalVideoTrack){
      // Acquire the replacement first. Cancellation keeps the current stream alive.
      const profile=screenProfiles[quality==='auto'?'1080':quality];
      const stream=await navigator.mediaDevices.getDisplayMedia({audio:false,video:{width:{ideal:profile.width},height:{ideal:profile.height},frameRate:{ideal:fps,max:fps}}});
      const replacement=stream.getVideoTracks()[0];
      try{
        if(!replacement)throw Error('Nenhuma tela foi selecionada.');
        if(active.current!==current||current.room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track!==existing){stream.getTracks().forEach(t=>t.stop());return;}
        replacement.contentHint=options.capture.contentHint??'motion';
        await existing.replaceTrack(replacement,{userProvidedTrack:false});
        if(active.current!==current)replacement.stop();
      }catch(error){stream.getTracks().forEach(t=>t.stop());throw error;}
    }else{
      await current.room.localParticipant.setScreenShareEnabled(true,options.capture,options.publish);
      if(active.current!==current){await current.room.localParticipant.setScreenShareEnabled(false);return;}
      if(screenAudio)try{await setSharedAudio(true);}catch(error){setError('Tela sem som: '+(error instanceof Error?error.message:'Não foi possível iniciar a captura.'));}
    }
    if(mounted.current)setSources(undefined);
  }

  const shortcutHandler=useRef<(value:'mute'|'deafen'|'cinema'|'unavailable'|boolean)=>void>(()=>{});
  shortcutHandler.current=value=>{if(typeof value==='boolean')processor.talk(value);else if(value==='unavailable'){processor.talk(false);setError('Pressionar para falar indisponível. Reative os atalhos ou reinstale o aplicativo; o microfone permanece protegido pelo modo pressionar para falar.');}else if(value==='cinema'){setOpen(true);setCinema(v=>!v);}else if(value==='deafen'&&local)void perform(async()=>{if(!deaf)await local.setMicrophoneEnabled(false);setDeaf(!deaf);});else if(active.current&&!deaf&&!testing)void perform(toggleMicrophone);};
  useEffect(()=>{const off=window.discorda?.onShortcut?.(value=>shortcutHandler.current(value));return()=>{off?.();void window.discorda?.shortcuts?.({...shortcuts,enabled:false});};},[]);
  useEffect(()=>{processor.configure({...microphone,pushToTalk:shortcuts.enabled&&shortcuts.pushToTalk});try{localStorage.setItem('discorda:shortcuts',JSON.stringify(shortcuts));}catch{}void window.discorda?.shortcuts?.({...shortcuts,enabled:shortcuts.enabled&&!!room}).then(()=>setShortcutError('')).catch(e=>setShortcutError(e instanceof Error?e.message:'Atalhos indisponíveis.'));},[shortcuts,room]);
  const moderationHandler=useRef<(destination:string|null)=>Promise<void>>(async()=>{});
  moderationHandler.current=async destination=>{const next=channels.find(c=>c.id===destination);await leave();if(next){await join(next);setError('Você foi movido por um moderador. Seu microfone está silenciado.');}else setError('Você foi removido da chamada por um moderador.');};
  useEffect(()=>window.discorda?.onLiveEvent(e=>{if(e.kind==='moderation'&&e.data.userId===userId)void moderationHandler.current(e.data.channelId).catch(()=>setError('A chamada foi alterada. Entre novamente na sala indicada.'));}),[userId]);
  async function chooseScreen(replace=false){
    setShareMenu(false);
    if(local?.isScreenShareEnabled&&!replace){await stopApplication();await local.setScreenShareEnabled(false);return;}
    setSources(await window.discorda!.captureSources());setAudioError('');
    try{const result=await window.discorda!.audioStatus();setAudioSupported(result.supported);if(!result.supported){setScreenAudio(false);setAudioError('Captura automática indisponível neste Windows. Nesta versão, compartilhar som do PC requer Windows 11.');}}
    catch{setAudioSupported(false);setScreenAudio(false);setAudioError('Componente de áudio indisponível. Reinstale a versão atual do Discorda e tente novamente.');}
  }
  return <section className="voice-sidebar" aria-label="Canais de voz">
    <div className="chat-channel-label">Canais de voz</div>
    <button className="temporary-room-button" onClick={()=>setCreatingRoom(true)}>＋ Criar sala temporária</button>{creatingRoom&&<TemporaryRoom close={()=>setCreatingRoom(false)} joined={item=>{setCreatingRoom(false);void perform(()=>join(item));}}/>}<nav>{channels.map(item=><div key={item.id}><button disabled={busy||testing} aria-current={channel?.id===item.id&&open?'page':undefined} className={channel?.id===item.id?(open?'selected connected':'connected'):''} onClick={()=>void perform(()=>join(item))}><Volume2 size={17}/><span title={item.temporary?'Sala temporária · expira após 2 minutos vazia':item.name}>{item.name}{item.temporary?' ◷':''}</span><small>{(rosterByChannel.get(item.id)??[]).length||''}</small></button><ul className="voice-roster">{(rosterByChannel.get(item.id)??[]).map(p=><li key={p.userId} className={(participantsByLease.get(p.leaseId??'')?.isSpeaking||(speakers[p.leaseId??'']?.speaking&&speakers[p.leaseId??''].until>Date.now()))?'is-speaking':''}><button aria-label={p.name} disabled={p.userId===userId} title={p.userId===userId?'Você':'Clique com o botão direito para ajustar o volume'} onClick={e=>openVolume(p.userId,p.name,e.clientX,e.clientY)} onContextMenu={e=>{e.preventDefault();if(p.userId!==userId)openVolume(p.userId,p.name,e.clientX,e.clientY);}}><span className="voice-member-photo"><Avatar url={presenceById.get(p.userId)?.avatarUrl} name={p.name}/></span><span className="voice-member-name">{p.name}</span></button></li>)}</ul></div>)}</nav>
    {rosterError&&<small className="voice-error">Participantes indisponíveis.</small>}
    {room&&active.current?.playback&&participants.filter(p=>!p.isLocal).map(p=><RemoteAudio key={p.identity} participant={p as RemoteParticipant} playback={active.current!.playback!} deaf={deaf} volume={volumes[memberKey(p)]??defaultVolume} revision={revision}/>)}
    {dockHost&&createPortal(<div className="voice-dock compact-dock">
      {channel&&<><div className="call-status"><span className="ping-indicator" tabIndex={0} title={ping===undefined?'Medindo latência da chamada…':'Ping da chamada: '+ping+' ms'} aria-label={ping===undefined?'Medindo ping':'Ping: '+ping+' ms'}><Signal size={20}/><span className="ping-tooltip">{ping===undefined?'Medindo…':ping+' ms'}</span></span><div><strong>{status==='Conectado'?'Voz conectada':status}</strong><small>{channel.name}</small></div><button title="Desconectar" aria-label="Sair da chamada" className="disconnect-button" onClick={()=>void leave()}><PhoneOff size={18}/></button></div>
      <div className="broadcast-controls"><button disabled={!local||busy} aria-pressed={!!local?.isCameraEnabled} title={local?.isCameraEnabled?'Desligar câmera':'Ligar câmera'} aria-label={local?.isCameraEnabled?'Desligar câmera':'Ligar câmera'} onClick={()=>void perform(()=>local!.setCameraEnabled(!local!.isCameraEnabled))}>{local?.isCameraEnabled?<Video size={21}/>:<VideoOff size={21}/>}<span>Câmera</span></button><button ref={shareButton} onContextMenu={e=>{if(local?.isScreenShareEnabled){e.preventDefault();setShareMenu(true);}}} onKeyDown={e=>{if(local?.isScreenShareEnabled&&(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')){e.preventDefault();setShareMenu(true);}}} disabled={!local||busy} aria-pressed={!!local?.isScreenShareEnabled} title={local?.isScreenShareEnabled?'Encerrar transmissão':'Compartilhar tela'} aria-label={local?.isScreenShareEnabled?'Parar tela':'Compartilhar tela'} onClick={()=>void perform(()=>chooseScreen())}><MonitorUp size={21}/><span>{local?.isScreenShareEnabled?'Parar tela':'Tela'}</span></button>{local?.isScreenShareEnabled&&<button className="share-options-trigger" aria-label="Opções da transmissão" aria-expanded={shareMenu} onClick={()=>setShareMenu(!shareMenu)}><ChevronUp size={14}/></button>}</div></>}
      {shareMenu&&local?.isScreenShareEnabled&&<div ref={shareMenuRef} className="share-options-menu" role="dialog" aria-label="Opções da transmissão"><strong>Transmissão ao vivo</strong><button disabled={busy} onClick={()=>{setShareMenu(false);void perform(()=>setSharedAudio(!sharingAudio));}}>{sharingAudio?'Desativar som do PC':'Ativar som do PC'}</button><button disabled={busy} onClick={()=>void perform(()=>chooseScreen(true))}>Trocar tela ou janela</button><small>Discord e Discorda ficam fora do áudio.</small><button onClick={()=>{setShareMenu(false);shareButton.current?.focus();}}>Fechar</button></div>}
      <UpdateNotice onOpen={()=>{setSettingsTab('updates');setAudioSettings(true);}}/>{error&&<div className="voice-recovery-notice"><p className="voice-error" role="alert">{error}</p><button onClick={()=>{setSettingsTab('diagnostics');setAudioSettings(true);}}>Resolver problema de chamada</button></div>}
      <div className="personal-controls"><div className="self-profile"><Avatar url={self?.avatarUrl} name={self?.name??'Você'}/><span><strong title={self?.name}>{self?.name??'Você'}</strong><small>{channel?'Em voz':'Disponível'}</small></span></div><div className="split-control"><button disabled={!local||busy||deaf||testing} className={local?.isMicrophoneEnabled?'':'is-off'} title={local?.isMicrophoneEnabled?'Silenciar microfone':'Ligar microfone'} aria-label={local?.isMicrophoneEnabled?'Silenciar microfone':'Ligar microfone'} onClick={()=>void perform(toggleMicrophone)}>{local?.isMicrophoneEnabled?<Mic size={18}/>:<MicOff size={18}/>}</button><button aria-label="Selecionar microfone" aria-expanded={deviceMenu==='audioinput'} onClick={()=>{setDeviceMenu(deviceMenu==='audioinput'?undefined:'audioinput');void refreshDevices().catch(()=>setError('Não foi possível listar microfones.'));}}>{deviceMenu==='audioinput'?<ChevronDown size={12}/>:<ChevronUp size={12}/>}</button></div><div className="split-control"><button disabled={!local||busy} title={deaf?'Voltar a ouvir':'Ensurdecer'} aria-label={deaf?'Voltar a ouvir':'Ensurdecer'} aria-pressed={deaf} onClick={()=>void perform(async()=>{if(!deaf)await local!.setMicrophoneEnabled(false);setDeaf(!deaf);})}>{deaf?<VolumeX size={18}/>:<Headphones size={18}/>}</button><button aria-label="Selecionar saída de áudio" aria-expanded={deviceMenu==='audiooutput'} onClick={()=>{setDeviceMenu(deviceMenu==='audiooutput'?undefined:'audiooutput');void refreshDevices().catch(()=>setError('Não foi possível listar saídas de áudio.'));}}>{deviceMenu==='audiooutput'?<ChevronDown size={12}/>:<ChevronUp size={12}/>}</button></div><button title="Configurações" aria-label="Ajustar microfone" onClick={()=>{setDeviceMenu(undefined);setSettingsTab('audio');setAudioSettings(true);void refreshDevices().catch(()=>{});}}><Settings size={18}/></button></div>
      {deviceMenu&&<div className="device-menu" onKeyDown={event=>{if(event.key==='Escape'){setDeviceMenu(undefined);}}} role="dialog" aria-label={deviceMenu==='audioinput'?'Dispositivo de entrada':'Dispositivo de saída'}><div><strong>{deviceMenu==='audioinput'?'Microfone':'Saída de áudio'}</strong><button aria-label="Fechar dispositivos" onClick={()=>setDeviceMenu(undefined)}><X size={15}/></button></div><select aria-label={deviceMenu==='audioinput'?'Escolher microfone':'Escolher saída'} value={deviceMenu==='audioinput'?microphone.deviceId:outputDevice} onChange={e=>void perform(()=>chooseDevice(deviceMenu,e.target.value))}><option value="">Padrão do Windows</option>{devices.filter(d=>d.kind===deviceMenu&&d.deviceId).map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'Dispositivo de áudio'}</option>)}</select></div>}
    </div>,dockHost)}
    {mediaHost&&room&&createPortal(<section className={"voice-panel"+(cinema?" cinema-mode":"")} role="region" aria-label={'Chamada '+(channel?.name??'')}>
      <header><div><h2>{channel?.name??'Chamada'}</h2><small>{participants.length} participante(s)</small></div></header>
      {!!tiles.length&&<div className="voice-view-options"><button aria-pressed={multi} onClick={()=>{setMulti(!multi);setPinned(undefined);}}>Mosaico de transmissões</button><button aria-pressed={cinema} onClick={()=>setCinema(!cinema)}>{cinema?'Sair do cinema (Esc)':'Modo cinema'}</button>{multi&&tiles.filter(t=>t.screen).map(t=><label key={t.key}><input type="checkbox" checked={!hiddenScreens.includes(t.key)} onChange={()=>setHiddenScreens(previous=>previous.includes(t.key)?previous.filter(k=>k!==t.key):[...previous,t.key])}/>{t.participant.name||'Tela'}</label>)}{!multi&&tiles.some(t=>t.screen)&&<label><input type="checkbox" checked={prioritizeScreen} onChange={e=>setPrioritizeScreen(e.target.checked)}/> Priorizar tela</label>}{pinned&&<button onClick={()=>setPinned(undefined)}>Desafixar</button>}<button onClick={e=>void e.currentTarget.closest('section')?.requestFullscreen()}>Tela cheia</button></div>}
      {ordered.length?<div className={'voice-grid'+(focus?' has-focus':'')} style={{'--tile-rows':Math.ceil(ordered.length/2)} as CSSProperties}>{ordered.map(tile=><ParticipantTile key={tile.key} avatarUrl={presenceById.get(tile.participant.isLocal?userId??'':memberKey(tile.participant))?.avatarUrl??(tile.participant.isLocal?self?.avatarUrl:undefined)} participant={tile.participant} track={tile.track} screen={tile.screen} focused={focus===tile} pinned={pinned===tile.key} pin={()=>{setMulti(false);setPinned(pinned===tile.key?undefined:tile.key);}} onVolume={e=>openVolume(memberKey(tile.participant),tile.participant.name||'Participante',e.clientX,e.clientY)}/>)}</div>:<div className="call-empty"><Headphones size={36}/><h2>{tiles.length?'Nenhuma transmissão selecionada':'Vocês estão na mesma sala.'}</h2><p>A conversa continua enquanto você navega pelo chat.<br/>Câmeras e telas compartilhadas aparecem aqui.</p><button onClick={()=>tiles.length?setHiddenScreens([]):setOpen(false)}>{tiles.length?'Mostrar transmissões':'Ir para o chat'}</button></div>}
    </section>,mediaHost)}
    {sources&&createPortal(<Modal className="capture-modal" label="Compartilhar tela" onClose={()=>{if(!busyRef.current)setSources(undefined);}}><section className="capture-picker"><div className="capture-title"><div><h2>{local?.isScreenShareEnabled?'Trocar tela ou janela':'Compartilhar tela'}</h2><p>{local?.isScreenShareEnabled?'A transmissão atual continua até você escolher. Qualidade e som serão mantidos.':'Escolha uma janela ou um monitor.'}</p></div><button aria-label="Cancelar compartilhamento" disabled={busy} onClick={()=>setSources(undefined)}><X size={20}/></button></div><fieldset className="capture-options" disabled={!!local?.isScreenShareEnabled}><label>Conteúdo<select aria-label="Perfil de transmissão" value={intent} onChange={e=>{const next=e.target.value as ScreenIntent;setIntent(next);setFps(next==='text'?30:60);}}><option value="auto">Automático · equilíbrio</option><option value="games">Vídeo e jogos · fluidez</option><option value="text">Texto e trabalho · nitidez</option></select></label><label>Resolução<select value={quality} onChange={e=>setQuality(e.target.value as keyof typeof screenProfiles|'auto')}><option value="auto">Automático · até 1080p</option>{Object.keys(screenProfiles).map(q=><option key={q} value={q}>{q==='2160'?'4K':q+'p'}</option>)}</select></label><label>Fluidez<select value={fps} onChange={e=>setFps(Number(e.target.value) as 30|60)}><option value="60">60 fps</option><option value="30">30 fps</option></select></label></fieldset><label className="share-sound"><input type="checkbox" disabled={!!local?.isScreenShareEnabled} checked={local?.isScreenShareEnabled?sharingAudio:screenAudio} onChange={e=>{if(audioSupported)setScreenAudio(e.target.checked);else setAudioError('Nesta versão, a captura automática de som precisa do Windows 11.');}}/>Compartilhar som do PC<span>Discord e Discorda ficam fora</span></label>{audioError&&<p className="voice-error" role="status">{audioError}</p>}{screenAudio&&<label className="exclude-browsers"><input type="checkbox" disabled={!!local?.isScreenShareEnabled} checked={excludeBrowsers} onChange={e=>setExcludeBrowsers(e.target.checked)}/> Também excluir navegadores (para quem usa Discord web)</label>}<p className="capture-note">O áudio dos aplicativos é detectado automaticamente. Notificações do Windows sem aplicativo identificado ficam fora.</p><div className="capture-grid">{sources.map(source=><button disabled={busy} key={source.id} onClick={()=>void perform(()=>share(source))}><img src={source.thumbnail} alt=""/><span>{source.name}</span></button>)}</div></section></Modal>,document.body)}
    {audioSettings&&createPortal(<SettingsDialog account={account} initialTab={settingsTab} onClose={()=>setAudioSettings(false)} audio={<><AudioSetup output={outputDevice}/><MicrophoneControls output={outputDevice} settings={microphone} change={configureMicrophone} callActive={!!local?.isMicrophoneEnabled} level={level} onTesting={setTesting}/><ShortcutControls error={shortcutError} value={shortcuts} change={setShortcuts}/><div className="voice-settings"><h3>Sons da chamada</h3><label>Volume dos avisos <output>{soundVolume}%</output><input aria-label="Volume dos avisos" type="range" min="0" max="100" step="5" value={soundVolume} onChange={e=>{const value=Number(e.target.value);setSoundVolume(value);try{localStorage.setItem('discorda:call-sounds',String(value));}catch{}}}/></label><p>Entrada, saída e compartilhamento de tela. Use 0% para silenciar. Ensurdecer também silencia os avisos.</p></div></>} devices={<><DevicePermissions/><div className="voice-settings"><h3>Dispositivos</h3><button disabled={!room} onClick={()=>void active.current?.playback?.notify('join',50)}>Testar som nos fones</button>{(['audioinput','audiooutput','videoinput'] as const).map(kind=><label key={kind}>{kind==='audioinput'?'Microfone':kind==='audiooutput'?'Fones / saída de som':'Câmera'}<select aria-label={kind} value={kind==='audioinput'?microphone.deviceId:kind==='audiooutput'?outputDevice:undefined} disabled={busy||(kind==='videoinput'&&!room)} onChange={e=>{const value=e.target.value;void perform(async()=>{if(kind==='videoinput')await room!.switchActiveDevice(kind,value);else await chooseDevice(kind,value);});}}><option value="">Padrão do Windows</option>{devices.filter(d=>d.kind===kind).map((d,i)=><option key={d.deviceId||i} value={d.deviceId}>{d.label||'Dispositivo '+(i+1)}</option>)}</select></label>)}<p>Microfone e fones podem ser escolhidos antes da chamada. A câmera requer uma sala conectada.</p></div></>} diagnostics={<><CallCheck input={microphone.deviceId} output={outputDevice} callActive={!!room}/><Diagnostics voice={status} reconnect={()=>{if(active.current)void recoverCall();else recovery.current.retryNow();}}/></>} updates={<UpdateControls/>}/>,document.body)}
    {volumeMenu&&createPortal(<div ref={menuRef} className="member-volume-menu" role="dialog" aria-label={'Volume de '+volumeMenu.name} style={{left:volumeMenu.x,top:volumeMenu.y}}><div><strong>{volumeMenu.name}</strong><button aria-label="Fechar volume" onClick={()=>setVolumeMenu(undefined)}><X size={15}/></button></div>{(['voice','screen'] as const).map(kind=><label key={kind}>{kind==='voice'?'Voz':'Som compartilhado'}<output>{(volumes[volumeMenu.id]??defaultVolume)[kind]}%</output><input aria-label={kind==='voice'?'Volume da voz':'Volume do compartilhamento'} type="range" min="0" max="400" step="5" value={(volumes[volumeMenu.id]??defaultVolume)[kind]} onChange={e=>changeVolume(volumeMenu.id,kind,Number(e.target.value))}/></label>)}<small>Só altera o volume para você.</small><button onClick={()=>{changeVolume(volumeMenu.id,'voice',150);changeVolume(volumeMenu.id,'screen',100);}}>Restaurar padrão</button></div>,document.body)}
  </section>;
}

function ParticipantTile({ avatarUrl,participant:p,track,screen,focused,pinned,pin,onVolume }: { avatarUrl?:string|null;participant:Participant;track:Track|undefined;screen:boolean;focused:boolean;pinned:boolean;pin:()=>void;onVolume:(event:React.MouseEvent)=>void }) {
  const tile=useRef<HTMLDivElement>(null);const [fullscreen,setFullscreen]=useState(false);
  useEffect(()=>{const changed=()=>setFullscreen(document.fullscreenElement===tile.current);document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
  return <div ref={tile} onContextMenu={e=>{if(!p.isLocal){e.preventDefault();onVolume(e);}}} className={`participant-tile ${p.isSpeaking?'speaking':''} ${focused?'focused':''} ${!track?'avatar-tile':''}`}>
    {track?<TrackVideo track={track} screen={screen} publication={!p.isLocal?p.getTrackPublication(screen?Track.Source.ScreenShare:Track.Source.Camera) as RemoteTrackPublication:undefined}/>:<div className="voice-avatar"><Avatar url={avatarUrl} name={p.name||'Participante'}/></div>}
    <div className="participant-caption"><span>{p.name||'Participante'}{p.isLocal?' (você)':''}{screen?' · Tela':''}</span>{!p.isMicrophoneEnabled&&<MicOff size={14}/>}<small>{p.connectionQuality==='poor'?'Conexão fraca':p.isSpeaking?'Falando':''}</small></div>
    <div className="tile-controls">{track&&<StreamWindow track={track} name={(p.name||'Participante')+(screen?' · Tela':' · Câmera')}/>}{!p.isLocal&&<button aria-label={'Ajustar volume de '+(p.name||'Participante')} onClick={onVolume}><Volume2 size={14}/> Volume</button>}<button onClick={pin} aria-pressed={pinned}>{pinned?'Desafixar':'Fixar'} {screen?'tela':'exibição'}</button><button onClick={()=>void(fullscreen?document.exitFullscreen():tile.current!.requestFullscreen()).catch(()=>{})}>{fullscreen?'Sair da tela cheia':'Tela cheia'}</button></div>
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
  return <><video ref={ref} autoPlay playsInline muted controls={false} disablePictureInPicture disableRemotePlayback controlsList="nodownload noplaybackrate noremoteplayback" onContextMenu={e=>e.preventDefault()} className={screen ? 'screen-video' : ''} onDoubleClick={e => void e.currentTarget.requestFullscreen().catch(() => {})}/>{screen&&<div className="screen-statistics"><span>{statistics}{health?' · '+health.mbps.toFixed(1)+' Mbps · '+Math.round(health.fps)+' fps '+(track instanceof LocalVideoTrack?'codificados':'recebidos'):''}</span><details><summary>Qualidade da transmissão</summary>{publication&&<label>Qualidade para você<select aria-label="Qualidade recebida" disabled={!publication.simulcasted} title={publication.simulcasted?'Limite de qualidade para você':'Quem transmite enviou uma única qualidade. Peça o perfil Automático para receber opções.'} value={receiveQuality} onChange={e=>{const value=e.target.value;setReceiveQuality(value);publication.setVideoQuality(value==='low'?VideoQuality.LOW:value==='medium'?VideoQuality.MEDIUM:VideoQuality.HIGH);}}><option value="auto">Automática / melhor disponível</option><option value="medium">Economizar · camada intermediária</option><option value="low">Economizar mais · camada baixa</option></select></label>}<p>{health?.hint??'Coletando métricas…'}</p>{health&&<p>Perda: {health.loss.toFixed(1)}% · Quadros descartados: {health.drop.toFixed(1)}% · Variação: {health.jitterMs.toFixed(0)} ms</p>}<small>Depende das camadas enviadas e da conexão. FPS em exibição mede o player; FPS codificados/recebidos mede a camada de vídeo observada. Uma tela parada pode enviar menos quadros. A qualidade escolhida é um limite, não uma garantia.</small></details></div>}</>;
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
