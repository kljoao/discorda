import {bindStreamZoom} from './stream-zoom';
import {useEffect,useRef,useState} from 'react';
import {LocalVideoTrack,RemoteVideoTrack,type Track} from 'livekit-client';

// One detached viewer at a time; ownership prevents an old tile from closing its successor.
let activeViewer: {close:()=>void}|undefined;

type StreamAudio={volume:number;muted:boolean;onVolume:(v:number)=>void;onMute:()=>void};
export function StreamWindow({track,name,audio}:{track:Track|undefined;name:string;audio?:StreamAudio}){
 const latest=useRef(audio);latest.current=audio;const refresh=useRef<()=>void>(()=>{});useEffect(()=>refresh.current(),[audio?.volume,audio?.muted]);
 const popup=useRef<Window|null>(null),cleanup=useRef<()=>void>(()=>{}),[error,setError]=useState('');
 useEffect(()=>()=>{cleanup.current();popup.current?.close();},[track]);
 function open(){
  setError('');if(!(track instanceof RemoteVideoTrack||track instanceof LocalVideoTrack))return;
  if(popup.current&&!popup.current.closed){popup.current.focus();return;}
  activeViewer?.close();
  const child=window.open('about:blank','discorda-stream','popup,width=1000,height=650');
  if(!child){setError('Não foi possível abrir a janela da transmissão.');return;}
  popup.current=child;const doc=child.document;doc.title=name+' · Discorda';doc.documentElement.lang='pt-BR';doc.body.className='popout-body';for(const key of ['font','contrast','motion'])doc.documentElement.dataset[key]=document.documentElement.dataset[key]??'';
  for(const sheet of document.querySelectorAll('link[rel="stylesheet"],style'))doc.head.appendChild(sheet.cloneNode(true));
  const header=doc.createElement('header'),title=doc.createElement('strong'),close=doc.createElement('button'),video=doc.createElement('video');
  title.textContent=name;close.textContent='Voltar ao Discorda';close.onclick=()=>{child.close();window.focus();};
  const compact=doc.createElement('button'),pin=doc.createElement('button'),fullscreen=doc.createElement('button');
  compact.textContent='Modo compacto';pin.textContent='Sempre no topo';fullscreen.textContent='Tela cheia';let compactMode=false,pinned=false;
  const native=async(action:{pinned?:boolean;compact?:boolean})=>{try{await window.discorda?.streamWindow?.(action);return true;}catch{setError('Não foi possível ajustar a janela.');return false;}};
  compact.onclick=async()=>{if(await native({compact:!compactMode})){compactMode=!compactMode;doc.body.classList.toggle('compact-viewer',compactMode);compact.textContent=compactMode?'Expandir':'Modo compacto';}};
  pin.disabled=!window.discorda?.streamWindow;pin.onclick=async()=>{if(await native({pinned:!pinned})){pinned=!pinned;pin.setAttribute('aria-pressed',String(pinned));}};
  fullscreen.onclick=()=>void(doc.fullscreenElement?doc.exitFullscreen():doc.documentElement.requestFullscreen()).catch(()=>setError('Tela cheia indisponível.'));
  header.append(title,compact,pin,fullscreen,close);video.autoplay=true;video.playsInline=true;video.muted=true;video.controls=false;video.disablePictureInPicture=true;
  video.oncontextmenu=event=>event.preventDefault();
  const resume=()=>{if(!child.closed&&video.srcObject)void video.play().catch(()=>{});};video.addEventListener('pause',resume);
  const viewport=doc.createElement('div'),controls=doc.createElement('div');viewport.className='stream-viewport';controls.className='stream-zoom-controls';viewport.append(video);doc.body.append(header,viewport,controls);track.attach(video);const unzoom=bindStreamZoom(video,viewport,controls);
  if(audio){const bar=doc.createElement('div'),mute=doc.createElement('button'),label=doc.createElement('label'),slider=doc.createElement('input'),value=doc.createElement('output');bar.className='stream-audio-controls';label.textContent='Som da transmissão ';slider.type='range';slider.min='0';slider.max='400';slider.step='5';slider.setAttribute('aria-label','Som da transmissão');slider.oninput=()=>latest.current?.onVolume(Number(slider.value));mute.onclick=()=>latest.current?.onMute();refresh.current=()=>{const state=latest.current;if(!state)return;slider.value=String(state.volume);value.value=state.volume+'%';mute.textContent=state.muted?'Ouvir transmissão':'Silenciar transmissão';mute.setAttribute('aria-pressed',String(state.muted));};label.append(value,slider);bar.append(mute,label);doc.body.append(bar);refresh.current();}
  // Audio remains in the main room mixer; the popout must never duplicate it.
  let detached=false;const detach=()=>{if(detached)return;detached=true;refresh.current=()=>{};unzoom();video.removeEventListener('pause',resume);track.detach(video);video.srcObject=null;};const owner={close:()=>{detach();child.close();}};
  activeViewer=owner;
  const release=()=>{detach();if(activeViewer===owner)activeViewer=undefined;};
  cleanup.current=()=>{release();child.close();};
  child.addEventListener('pagehide',release,{once:true});child.focus();
 }
 return <><button className="stream-popout" onClick={open}>Abrir em outra janela</button>{error&&<span role="alert">{error}</span>}</>;
}
