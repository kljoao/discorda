import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {Volume2,VolumeX} from 'lucide-react';

export function StreamVolume({name,volume,muted,onVolume,onMute}:{name:string;volume:number;muted:boolean;onVolume:(value:number)=>void;onMute:()=>void}) {
  const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
  useLayoutEffect(()=>{
    if(!open||!panel.current||!trigger.current)return;
    const element=panel.current,doc=element.ownerDocument,view=doc.defaultView!;
    element.showPopover();
    const position=()=>{
      const anchor=trigger.current!.getBoundingClientRect(),height=element.getBoundingClientRect().height;
      element.style.left=Math.max(8,Math.min(view.innerWidth-90,anchor.left+anchor.width/2-41))+'px';
      element.style.top=Math.max(8,Math.min(view.innerHeight-height-8,anchor.top-height-12))+'px';
    };
    position();view.addEventListener('resize',position);doc.addEventListener('scroll',position,true);
    return()=>{view.removeEventListener('resize',position);doc.removeEventListener('scroll',position,true);if(element.isConnected)element.hidePopover();};
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const dismiss=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const doc=root.current!.ownerDocument;
    doc.addEventListener('pointerdown',dismiss);return()=>doc.removeEventListener('pointerdown',dismiss);
  },[open]);
  return <div className="room-volume" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}} onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}}}>
    <button type="button" className="room-icon-button" ref={trigger} title={'Volume de '+name} aria-label={'Volume da transmissão de '+name} aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(value=>!value)}>{muted||!volume?<VolumeX size={19}/>:<Volume2 size={19}/>}</button>
    {open&&<div ref={panel} popover="manual" className="room-volume-panel" id={id} role="group" aria-label={'Áudio de '+name}><span>Volume</span><output>{muted?'Mudo':volume+'%'}</output><input type="range" aria-label={'Som da transmissão de '+name} aria-orientation="vertical" min={0} max={400} step={5} value={volume} style={{'--volume-level':(volume/4)+'%'} as CSSProperties} onChange={event=>onVolume(Number(event.target.value))}/><button type="button" className="room-icon-button" aria-label={muted?'Ouvir transmissão':'Silenciar transmissão'} aria-pressed={muted} onClick={onMute}>{muted?<VolumeX size={17}/>:<Volume2 size={17}/>}</button><button type="button" className="room-volume-reset" onClick={()=>onVolume(100)}>100%</button></div>}
  </div>;
}
