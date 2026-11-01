
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Room,RoomEvent,Track,LocalVideoTrack,RemoteVideoTrack,RemoteAudioTrack,type LocalTrackPublication,type RemoteParticipant} from 'livekit-client';
import {Voice} from '../../src/renderer/features/chat/Voice';
import {VoicePlayback} from '../../src/renderer/features/chat/playback';
import type {CallSound} from '../../src/renderer/features/chat/call-sounds';
import '../../src/renderer/styles.css';
import '../../src/renderer/features.css';
import '../../src/renderer/refinements.css';
import '../../src/renderer/community.css';
import '../../src/renderer/server-navigation.css';
import '../../src/renderer/conversation-layout.css';

// Test-only transport simulation with real MediaStreamTracks and RTCRtpSender replacement.
let autoSubscribe:boolean|undefined;
const notifications:string[]=[];
let audioPacketTimer:ReturnType<typeof setInterval>|undefined,pcmPosition=0;
const pcmListeners=new Set<(data:Uint8Array)=>void>();
let publishedAudioLevel=()=>0,mixedAudioLevel=()=>0;
function probe(context:AudioContext,node:AudioNode){const analyser=context.createAnalyser(),mute=context.createGain();mute.gain.value=0;node.connect(analyser);analyser.connect(mute).connect(context.destination);const values=new Float32Array(analyser.fftSize);return ()=>{analyser.getFloatTimeDomainData(values);return Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/values.length);};}
const originalAttach=VoicePlayback.prototype.attach;
VoicePlayback.prototype.attach=function(...args:Parameters<VoicePlayback['attach']>){const result=originalAttach.apply(this,args);mixedAudioLevel=probe(this.context,(this as any).limiter);return result;};
let selected='screen:1',starts=0,stops=0,joins=0,old:MediaStreamTrack|undefined,currentRoom:Room;
const fixtureUserId=(index:number)=>'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0');
const peers:RTCPeerConnection[]=[];
const audioContexts:AudioContext[]=[];
const originalNotify=VoicePlayback.prototype.notify;
VoicePlayback.prototype.notify=async function(kind:CallSound,volume:number){notifications.push(kind);await originalNotify.call(this,kind,volume);};
function capture(label=selected){
 const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d')!;
 const gradient=ctx.createLinearGradient(0,0,1280,720);gradient.addColorStop(0,label.includes('Bruno')?'#163c3c':'#272f58');gradient.addColorStop(1,'#11131f');ctx.fillStyle=gradient;ctx.fillRect(0,0,1280,720);
 ctx.fillStyle='#ffffff09';ctx.fillRect(48,44,1184,52);ctx.fillStyle='#b7c2e5';ctx.font='18px sans-serif';ctx.fillText('Projeto Aurora  /  '+label,76,77);
 ctx.fillStyle='#aab9ff';ctx.font='18px sans-serif';ctx.fillText('UMA IDEIA, MUITAS POSSIBILIDADES',90,260);
 ctx.fillStyle='#f0f2ff';ctx.font='58px sans-serif';ctx.fillText(label.includes('Bruno')?'Criando em conjunto.':'Planejando o próximo passo.',86,342);
 ctx.fillStyle='#b3bed8';ctx.font='24px sans-serif';ctx.fillText('Espaço para compartilhar, conversar e construir.',90,398);
 ctx.fillStyle='#b6c4ff';ctx.fillRect(90,454,144,4);ctx.fillStyle='#ffffff12';ctx.fillRect(252,454,86,4);
 ctx.fillStyle='#8690b2';ctx.font='16px sans-serif';ctx.fillText('APRESENTAÇÃO DA EQUIPE',90,642);ctx.fillText('01 / 08',1110,642);
 return canvas.captureStream(10);
}
navigator.mediaDevices.getDisplayMedia=async()=>capture();
Room.prototype.connect=async function(_url,_token,options){
 autoSubscribe=options?.autoSubscribe;
 currentRoom=this;joins++;
 this.localParticipant.identity='self';this.localParticipant.name='Você';
 for(const [i,name] of ['Ana','Bruno','Carla','Diego'].entries())this.remoteParticipants.set('lease-'+i+'-'+joins,{identity:'lease-'+i+'-'+joins,metadata:JSON.stringify({userId:fixtureUserId(i)}),name,isLocal:false,isSpeaking:i===1,isMicrophoneEnabled:i!==2,connectionQuality:'excellent',trackPublications:new Map(),videoTrackPublications:new Map(),audioTrackPublications:new Map(),getTrackPublication(this:any,source:Track.Source){return [...this.trackPublications.values()].find((publication:any)=>publication.source===source);}} as unknown as RemoteParticipant);
 this.localParticipant.setCameraEnabled=async enabled=>{
  const existing=this.localParticipant.videoTrackPublications.get('camera');
  if(!enabled){existing?.track?.stop();this.localParticipant.trackPublications.delete('camera');this.localParticipant.videoTrackPublications.delete('camera');if(existing)this.emit(RoomEvent.LocalTrackUnpublished,existing,this.localParticipant);return undefined;}
  const track=new LocalVideoTrack(capture('Webcam').getVideoTracks()[0]);track.source=Track.Source.Camera;
  const publication={source:Track.Source.Camera,track,trackSid:'camera',isMuted:false} as unknown as LocalTrackPublication;
  this.localParticipant.trackPublications.set('camera',publication);this.localParticipant.videoTrackPublications.set('camera',publication);this.emit(RoomEvent.LocalTrackPublished,publication,this.localParticipant);return publication;
 };
 this.localParticipant.publishTrack=async track=>{
  const context=new AudioContext();audioContexts.push(context);await context.resume();publishedAudioLevel=probe(context,context.createMediaStreamSource(new MediaStream([track instanceof MediaStreamTrack?track:track.mediaStreamTrack])));
  const source=Track.Source.ScreenShareAudio;
  const publication={source,track,trackSid:'audio',isMuted:false} as unknown as LocalTrackPublication;
  this.localParticipant.trackPublications.set('audio',publication);this.localParticipant.audioTrackPublications.set('audio',publication);return publication;
 };
 this.localParticipant.unpublishTrack=async()=>{this.localParticipant.trackPublications.delete('audio');this.localParticipant.audioTrackPublications.delete('audio');return undefined;};
 this.localParticipant.setScreenShareEnabled=async enabled=>{
  if(!enabled){stops++;const publication=this.localParticipant.videoTrackPublications.get('screen');publication?.track?.stop();this.localParticipant.trackPublications.delete('screen');this.localParticipant.videoTrackPublications.delete('screen');if(publication)this.emit(RoomEvent.LocalTrackUnpublished,publication,this.localParticipant);return undefined;}
  starts++;const stream=capture();old=stream.getVideoTracks()[0];const track=new LocalVideoTrack(old,undefined,false);track.source=Track.Source.ScreenShare;
  const pc=new RTCPeerConnection();peers.push(pc);track.sender=pc.addTrack(old,stream);
  const publication={source:Track.Source.ScreenShare,track,trackSid:'screen',isMuted:false} as unknown as LocalTrackPublication;
  this.localParticipant.trackPublications.set('screen',publication);this.localParticipant.videoTrackPublications.set('screen',publication);this.emit(RoomEvent.LocalTrackPublished,publication,this.localParticipant);return publication;
 };
 if(new URLSearchParams(location.search).has('initial'))addFixtureStreams();
};
Room.prototype.startAudio=async()=>{};
Room.prototype.disconnect=async()=>{peers.forEach(pc=>pc.close());await Promise.all(audioContexts.map(context=>context.close()));audioContexts.length=0;};
const names=['Ana','Bruno','Carla','Diego'];
window.discorda={
 onPowerState:(listener:(state:'suspend'|'resume')=>void)=>{const receive=(event:Event)=>listener((event as CustomEvent).detail);window.addEventListener('fixture-power',receive);return()=>window.removeEventListener('fixture-power',receive);},
 chat:async()=>({ok:true,data:names.map((name,i)=>({channelId:'voice',userId:fixtureUserId(i),leaseId:'lease-'+i,name}))}),
 media:async()=>({ok:true,data:{url:'wss://fixture.invalid',token:'fixture',leaseId:'self'}}),
 onLiveEvent:()=>()=>{},onShortcut:()=>()=>{},shortcuts:async()=>{},voiceActivity:async()=>{},
 updates:async()=>({status:'idle',version:'test'}),getAppInfo:async()=>({version:'test',platform:'win32'}),
 audioStatus:async()=>({supported:true,os:'test'}),captureSources:async()=>['screen:1','screen:2','window:1','window:2','window:3'].map(id=>({id,name:id,thumbnail:'/resources/icon.png',kind:'screen'})),
 selectCapture:async (id:string)=>{selected=id;},applicationAudio:async(action:any)=>{if(action.kind==='stop'){clearInterval(audioPacketTimer);audioPacketTimer=undefined;}else if(action.kind==='start'){clearInterval(audioPacketTimer);audioPacketTimer=setInterval(()=>{const samples=new Float32Array(1920);for(let i=0;i<960;i++){samples[i*2]=Math.sin(2*Math.PI*440*pcmPosition/48000)*0.04;samples[i*2+1]=Math.sin(2*Math.PI*660*pcmPosition/48000)*0.04;pcmPosition++;}const bytes=new Uint8Array(samples.buffer);pcmListeners.forEach(listener=>listener(bytes));},20);}},onApplicationAudio:(listener:(data:Uint8Array)=>void)=>{pcmListeners.add(listener);return()=>{pcmListeners.delete(listener);};},onApplicationAudioEnd:()=>()=>{},
} as unknown as NonNullable<Window['discorda']>;
let publicationNumber=0;
function addFixtureStreams(){
 for(const peer of [...currentRoom.remoteParticipants.values()].slice(0,2)){
  if(peer.getTrackPublication(Track.Source.ScreenShare))continue;
  const sid='screen-'+peer.identity+'-'+(++publicationNumber),receiver={getStats:async()=>new Map()} as unknown as RTCRtpReceiver;
  const video=new RemoteVideoTrack(capture(peer.name).getVideoTracks()[0],sid,receiver);video.source=Track.Source.ScreenShare;
  const context=new AudioContext();audioContexts.push(context);const oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();gain.gain.value=0.04;oscillator.connect(gain).connect(destination);oscillator.start();
  const audio=new RemoteAudioTrack(destination.stream.getAudioTracks()[0],sid+'-audio',receiver);audio.source=Track.Source.ScreenShareAudio;
  for(const [source,media] of [[Track.Source.ScreenShare,video],[Track.Source.ScreenShareAudio,audio]] as const){
   const publication:any={source,track:undefined,trackSid:source===Track.Source.ScreenShare?sid:sid+'-audio',isMuted:false,isDesired:false,simulcasted:true,setVideoQuality:()=>{},setSubscribed(enabled:boolean){
    if(this.isDesired===enabled)return;this.isDesired=enabled;this.track=enabled?media:undefined;
    currentRoom.emit(enabled?RoomEvent.TrackSubscribed:RoomEvent.TrackUnsubscribed,media,this,peer);
   }};
   peer.trackPublications.set(publication.trackSid,publication);
   (source===Track.Source.ScreenShare?peer.videoTrackPublications:peer.audioTrackPublications).set(publication.trackSid,publication);
   currentRoom.emit(RoomEvent.TrackPublished,publication,peer);
  }
 }
}
function removeFixtureStream(name:string){
 const peer=[...currentRoom.remoteParticipants.values()].find(participant=>participant.name===name)!;
 for(const publication of [...peer.trackPublications.values()]){
  peer.trackPublications.delete(publication.trackSid);peer.videoTrackPublications.delete(publication.trackSid);peer.audioTrackPublications.delete(publication.trackSid);
  currentRoom.emit(RoomEvent.TrackUnpublished,publication,peer);
 }
}
function addFixtureCamera(){
 const peer=[...currentRoom.remoteParticipants.values()].find(participant=>participant.name==='Carla')!;
 const track=new RemoteVideoTrack(capture('Webcam de Carla').getVideoTracks()[0],'carla-camera',{getStats:async()=>new Map()} as unknown as RTCRtpReceiver);track.source=Track.Source.Camera;
 const publication:any={source:Track.Source.Camera,track:undefined,trackSid:'carla-camera',isMuted:false,isDesired:false,setSubscribed(enabled:boolean){this.isDesired=enabled;this.track=enabled?track:undefined;currentRoom.emit(enabled?RoomEvent.TrackSubscribed:RoomEvent.TrackUnsubscribed,track,this,peer);}};
 peer.videoTrackPublications.set(publication.trackSid,publication);peer.trackPublications.set(publication.trackSid,publication);currentRoom.emit(RoomEvent.TrackPublished,publication,peer);
}
Object.assign(window,{addFixtureStreams,removeFixtureStream,addFixtureCamera,voiceSnapshot:()=>({publishedAudioLevel:publishedAudioLevel(),mixedAudioLevel:mixedAudioLevel(),joins,starts,stops,old:old?.readyState,current:currentRoom?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack.readyState,audio:currentRoom?.localParticipant.audioTrackPublications.size,autoSubscribe,notifications,subscriptions:[...(currentRoom?.remoteParticipants.values()??[])].map(participant=>({name:participant.name,tracks:[...participant.trackPublications.values()].map(publication=>({source:publication.source,desired:publication.isDesired}))}))})});

function Fixture(){
 const [open,setOpen]=useState(false),[mediaHost,setMediaHost]=useState<HTMLDivElement|null>(null),[dockHost,setDockHost]=useState<HTMLDivElement|null>(null);
 return <div className="chat-shell members-collapsed"><nav className="server-rail">D</nav><aside className="chat-sidebar"><h2>Grupo de teste</h2><button onClick={()=>setOpen(false)}>geral</button><div className="sidebar-scroll"><Voice channels={[{id:'voice',name:'Conversa'}]} userId="self" self={{id:'self',name:'Você',status:'online',typingChannelId:null,avatarUrl:'/resources/icon.png'}} presence={names.map((name,i)=>({id:fixtureUserId(i),name,status:'online',typingChannelId:null,avatarUrl:'/resources/icon.png'}))} mediaHost={mediaHost} dockHost={dockHost} open={open} setOpen={setOpen} account={<p>Minha conta</p>}/></div><div ref={setDockHost} className="sidebar-footer"/></aside><main className="chat-main"><div ref={setMediaHost} className="call-stage" hidden={!open}/><div hidden={open}>Chat de texto</div></main></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

