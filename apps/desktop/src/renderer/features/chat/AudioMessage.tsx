import {useEffect,useId,useRef,useState,type CSSProperties} from 'react';
import {Play,Pause,Volume2,VolumeX,RotateCcw} from 'lucide-react';
import {AudioSpectrum} from './AudioSpectrum';
import './voice-message.css';

export const audioPlaybackEvent='discorda:voice-message-play';
export function audioTime(seconds:number){const value=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;}
export function AudioMessage({src,duration:hint=0,label='Mensagem de voz',onPlaying,loading=false}:{src:string;duration?:number;label?:string;onPlaying?:(playing:boolean)=>void;loading?:boolean}){
 const id=useId(),audio=useRef<HTMLAudioElement>(null),graph=useRef<{context:AudioContext;source:MediaElementAudioSourceNode;analyser:AnalyserNode;gain:GainNode}|undefined>(undefined),epoch=useRef(0),lastTime=useRef(0);
 const [playing,setPlaying]=useState(false),[busy,setBusy]=useState(false),[time,setTime]=useState(0),[duration,setDuration]=useState(hint),[analyser,setAnalyser]=useState<AnalyserNode>(),[error,setError]=useState('');
 const [volume,setVolume]=useState(()=>{try{const saved=Number(localStorage.getItem('discorda:voice-volume')??'85');return Number.isFinite(saved)?Math.max(0,Math.min(100,saved)):85;}catch{return 85;}}),previousVolume=useRef(85);
 const callback=useRef(onPlaying);callback.current=onPlaying;
 function pause(){epoch.current++;audio.current?.pause();setPlaying(false);setBusy(false);callback.current?.(false);void graph.current?.context.suspend().catch(()=>{});}
 useEffect(()=>{
  const other=(event:Event)=>{if((event as CustomEvent).detail!==id)pause();};window.addEventListener(audioPlaybackEvent,other);
  return()=>{epoch.current++;window.removeEventListener(audioPlaybackEvent,other);audio.current?.pause();graph.current?.source.disconnect();graph.current?.analyser.disconnect();graph.current?.gain.disconnect();void graph.current?.context.close().catch(()=>{});callback.current?.(false);};
 },[]);
 useEffect(()=>{if(graph.current)graph.current.gain.gain.setTargetAtTime(volume/100,graph.current.context.currentTime,.015);try{localStorage.setItem('discorda:voice-volume',String(volume));}catch{}},[volume]);
 useEffect(()=>{if(hint>0)setDuration(hint);},[hint]);
 useEffect(()=>{if(!playing)return;const timer=setInterval(()=>{if(audio.current&&audio.current.readyState>0){lastTime.current=audio.current.currentTime;setTime(lastTime.current);}},80);return()=>clearInterval(timer);},[playing]);
 async function toggle(){
  if(playing||busy){pause();return;}if(!src)return;
  const revision=++epoch.current;setBusy(true);setError('');window.dispatchEvent(new CustomEvent(audioPlaybackEvent,{detail:id}));
  let choosingOutput=false;
  try{
   if(!graph.current){const context=new AudioContext(),source=context.createMediaElementSource(audio.current!),analyser=context.createAnalyser(),gain=context.createGain();analyser.fftSize=1024;analyser.smoothingTimeConstant=.7;gain.gain.value=volume/100;source.connect(analyser).connect(gain).connect(context.destination);graph.current={context,source,analyser,gain};setAnalyser(analyser);}
   const context=graph.current.context as AudioContext&{setSinkId?:(id:string)=>Promise<void>};let output='';try{output=localStorage.getItem('discorda:output')??'';}catch{}
   if(context.setSinkId){choosingOutput=true;await context.setSinkId(output);choosingOutput=false;}else if(output){choosingOutput=true;throw Error('Output unavailable');}
   await graph.current.context.resume();if(revision!==epoch.current)return;
   if(audio.current!.ended){audio.current!.currentTime=0;lastTime.current=0;setTime(0);}
   await audio.current!.play();if(revision!==epoch.current){audio.current?.pause();return;}setPlaying(true);callback.current?.(true);
  }catch{if(revision===epoch.current){setError(choosingOutput?'A saída de áudio escolhida não está disponível. Confira seus fones em Configurações → Dispositivos.':'Não foi possível reproduzir. Tente novamente ou baixe o áudio.');callback.current?.(false);}}
  finally{if(revision===epoch.current)setBusy(false);}
 }
 function clock(){const element=audio.current;if(!element||element.readyState===0)return;lastTime.current=element.currentTime;setTime(element.currentTime);if(Number.isFinite(element.duration)&&element.duration>0)setDuration(element.duration);}
 const total=duration>0?duration:hint,progress=total>0?Math.min(100,time/total*100):0;
 return <section className={'voice-message-player'+(playing?' is-playing':'')} aria-label={label}>
  <audio ref={audio} src={src||undefined} preload="metadata" onLoadedMetadata={event=>{const el=event.currentTarget;if(Number.isFinite(el.duration)&&el.duration>0)setDuration(el.duration);if(lastTime.current>0)el.currentTime=lastTime.current;}} onDurationChange={clock} onTimeUpdate={clock} onEnded={()=>{clock();pause();}} onPause={()=>{setPlaying(false);callback.current?.(false);}} onError={()=>{if(src){setError('Áudio indisponível. Tente carregar novamente ou baixe o arquivo.');pause();}}}/>
  <div className="voice-player-body"><button type="button" className="voice-play-button" aria-label={playing||busy?'Pausar áudio':'Reproduzir áudio'} disabled={!src} onClick={()=>void toggle()}>{playing||busy?<Pause size={21} fill="currentColor"/>:<Play size={21} fill="currentColor"/>}</button><div className="voice-wave-track"><AudioSpectrum analyser={analyser} active={playing} progress={progress} label={playing?'Onda do áudio em reprodução':'Onda do áudio pausado'}/><label className="voice-seek"><span className="sr-only">Posição do áudio</span><input aria-label="Posição do áudio" aria-valuetext={`${audioTime(time)} de ${audioTime(total)}`} type="range" min={0} max={Math.max(.1,total)} step={.05} value={Math.min(time,Math.max(.1,total))} disabled={!src||!total} style={{'--voice-progress':`${progress}%`} as CSSProperties} onChange={event=>{const value=Number(event.target.value);if(audio.current){audio.current.currentTime=value;lastTime.current=value;setTime(value);}}}/></label></div></div>
  <div className="voice-player-footer"><span className="voice-time"><strong>{audioTime(time)}</strong><span>/ {audioTime(total)}</span></span><div className="voice-volume"><button type="button" aria-label={volume===0?'Ativar som do áudio':'Silenciar áudio'} onClick={()=>{if(volume){previousVolume.current=volume;setVolume(0);}else setVolume(previousVolume.current||85);}}>{volume===0?<VolumeX size={16}/>:<Volume2 size={16}/>}</button><input type="range" aria-label="Volume do áudio" min={0} max={100} value={volume} style={{'--voice-progress':`${volume}%`} as CSSProperties} onChange={e=>setVolume(Number(e.target.value))}/><output aria-label="Volume atual">{volume}%</output></div></div>
  {error&&<p role="alert" className="voice-player-error">{error}<button type="button" onClick={()=>{setError('');audio.current?.load();}}><RotateCcw size={12}/>Tentar novamente</button></p>}
 </section>;
}
