import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LocalVideoTrack} from 'livekit-client';
import {StreamWindow} from '../../src/renderer/features/chat/StreamWindow';
import '../../src/renderer/community.css';
function Fixture(){
 const [volume,setVolume]=useState(100),[muted,setMuted]=useState(false);
 const [track,setTrack]=useState<LocalVideoTrack>(),[chat,setChat]=useState(false),[first,setFirst]=useState(true);
 useEffect(()=>{
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d')!;
  const draw=()=>{ctx.fillStyle='#262637';ctx.fillRect(0,0,640,360);ctx.fillStyle='#c4caff';ctx.font='32px sans-serif';ctx.fillText('Transmissão de teste',50,180);};
  draw();const timer=setInterval(draw,100),stream=canvas.captureStream(10),local=new LocalVideoTrack(stream.getVideoTracks()[0]);setTrack(local);
  return()=>{clearInterval(timer);local.stop();};
 },[]);
 return <><label>Mensagem<input/></label><button onClick={()=>setChat(!chat)}>Alternar chat</button><div hidden={chat}>{track&&<>{first&&<StreamWindow audio={{volume,muted,onVolume:setVolume,onMute:()=>setMuted(v=>!v)}} track={track} name="Amigo · Tela"/>}<StreamWindow track={track} name="Outra pessoa · Tela"/></>}</div><button onClick={()=>setFirst(false)}>Remover primeira pessoa</button><button onClick={()=>setTrack(undefined)}>Encerrar transmissão</button></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
