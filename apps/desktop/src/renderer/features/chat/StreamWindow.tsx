import {useEffect,useRef,useState} from 'react';
import {LocalVideoTrack,RemoteVideoTrack,type Track} from 'livekit-client';

// One detached viewer at a time; ownership prevents an old tile from closing its successor.
let activeViewer: {close:()=>void}|undefined;

export function StreamWindow({track,name}:{track:Track|undefined;name:string}){
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
  header.append(title,close);video.autoplay=true;video.playsInline=true;video.muted=true;video.controls=false;video.disablePictureInPicture=true;
  video.oncontextmenu=event=>event.preventDefault();
  const resume=()=>{if(!child.closed&&video.srcObject)void video.play().catch(()=>{});};video.addEventListener('pause',resume);
  doc.body.append(header,video);track.attach(video);
  // Audio remains in the main room mixer; the popout must never duplicate it.
  let detached=false;const detach=()=>{if(detached)return;detached=true;video.removeEventListener('pause',resume);track.detach(video);video.srcObject=null;};const owner={close:()=>{detach();child.close();}};
  activeViewer=owner;
  const release=()=>{detach();if(activeViewer===owner)activeViewer=undefined;};
  cleanup.current=()=>{release();child.close();};
  child.addEventListener('pagehide',release,{once:true});child.focus();
 }
 return <><button className="stream-popout" onClick={open}>Abrir em outra janela</button>{error&&<span role="alert">{error}</span>}</>;
}
