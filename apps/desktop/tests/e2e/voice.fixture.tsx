
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Room,RoomEvent,Track,LocalVideoTrack,type LocalTrackPublication,type RemoteParticipant} from 'livekit-client';
import {Voice} from '../../src/renderer/features/chat/Voice';
import '../../src/renderer/styles.css';
import '../../src/renderer/refinements.css';
import '../../src/renderer/community.css';
import '../../src/renderer/server-navigation.css';
import '../../src/renderer/conversation-layout.css';

// Test-only transport simulation with real MediaStreamTracks and RTCRtpSender replacement.
let selected='screen:1',starts=0,stops=0,old:MediaStreamTrack|undefined,currentRoom:Room;
const peers:RTCPeerConnection[]=[];
function capture(){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d')!;ctx.fillStyle=selected==='screen:1'?'#3a405a':'#635279';ctx.fillRect(0,0,640,360);ctx.fillStyle='white';ctx.font='28px sans-serif';ctx.fillText(selected,60,150);return canvas.captureStream(10);}
navigator.mediaDevices.getDisplayMedia=async()=>capture();
Room.prototype.connect=async function(){
 currentRoom=this;
 this.localParticipant.identity='self';this.localParticipant.name='Você';
 for(const [i,name] of ['Ana','Bruno','Carla','Diego'].entries())this.remoteParticipants.set('lease-'+i,{identity:'lease-'+i,name,isLocal:false,isSpeaking:i===1,isMicrophoneEnabled:i!==2,connectionQuality:'excellent',trackPublications:new Map(),videoTrackPublications:new Map(),audioTrackPublications:new Map(),getTrackPublication:()=>undefined} as unknown as RemoteParticipant);
 this.localParticipant.publishTrack=async track=>{
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
};
Room.prototype.startAudio=async()=>{};
Room.prototype.disconnect=async()=>{peers.forEach(pc=>pc.close());};
const names=['Ana','Bruno','Carla','Diego'];
window.discorda={
 chat:async()=>({ok:true,data:names.map((name,i)=>({channelId:'voice',userId:'user-'+i,leaseId:'lease-'+i,name}))}),
 media:async()=>({ok:true,data:{url:'wss://fixture.invalid',token:'fixture',leaseId:'self'}}),
 onLiveEvent:()=>()=>{},onShortcut:()=>()=>{},shortcuts:async()=>{},voiceActivity:async()=>{},
 updates:async()=>({status:'idle',version:'test'}),getAppInfo:async()=>({version:'test',platform:'win32'}),
 audioStatus:async()=>({supported:true,os:'test'}),captureSources:async()=>['screen:1','screen:2'].map(id=>({id,name:id,thumbnail:'/resources/icon.png',kind:'screen'})),
 selectCapture:async (id:string)=>{selected=id;},applicationAudio:async()=>{},onApplicationAudio:()=>()=>{},onApplicationAudioEnd:()=>()=>{},
} as unknown as NonNullable<Window['discorda']>;
Object.assign(window,{voiceSnapshot:()=>({starts,stops,old:old?.readyState,current:currentRoom?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack.readyState,audio:currentRoom?.localParticipant.audioTrackPublications.size})});
function Fixture(){
 const [open,setOpen]=useState(false),[mediaHost,setMediaHost]=useState<HTMLDivElement|null>(null),[dockHost,setDockHost]=useState<HTMLDivElement|null>(null);
 return <div className="chat-shell members-collapsed"><nav className="server-rail">D</nav><aside className="chat-sidebar"><h2>Grupo de teste</h2><button onClick={()=>setOpen(false)}>geral</button><div className="sidebar-scroll"><Voice channels={[{id:'voice',name:'Conversa'}]} userId="self" self={{id:'self',name:'Você',status:'online',typingChannelId:null,avatarUrl:'/resources/icon.png'}} presence={names.map((name,i)=>({id:'user-'+i,name,status:'online',typingChannelId:null,avatarUrl:'/resources/icon.png'}))} mediaHost={mediaHost} dockHost={dockHost} open={open} setOpen={setOpen} account={<p>Minha conta</p>}/></div><div ref={setDockHost} className="sidebar-footer"/></aside><main className="chat-main"><div ref={setMediaHost} className="call-stage" hidden={!open}/><div hidden={open}>Chat de texto</div></main></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

