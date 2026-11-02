import {useEffect,useRef,useState} from 'react';
import {Mic,Square,Trash2,Send,LoaderCircle} from 'lucide-react';
import {AudioSpectrum} from './AudioSpectrum';
import {AudioMessage,audioPlaybackEvent,audioTime} from './AudioMessage';
import {readMicrophoneSettings,MicrophoneProcessor,voiceCaptureOptions} from './microphone';
import {Track} from 'livekit-client';
import {mediaErrorMessage} from './media-errors';
import type {ChatMessage} from '../../../shared/ipc/contracts';

type Capture={recorder:MediaRecorder;stream:MediaStream;output:MediaStream;context:AudioContext;source:MediaStreamAudioSourceNode;processor:MicrophoneProcessor;analyser:AnalyserNode;chunks:Blob[];size:number;started:number;timer?:ReturnType<typeof setInterval>};
type Draft={blob:Blob;url:string;duration:number;id:string};
const maxSeconds=120,maxBytes=8*1024*1024;
function release(capture:Capture){clearInterval(capture.timer);capture.stream.getTracks().forEach(track=>track.stop());capture.output.getTracks().forEach(track=>track.stop());capture.source.disconnect();void capture.processor.destroy();capture.analyser.disconnect();void capture.context.close().catch(()=>{});}
export function useVoiceComposer(channelId:string,onSent:(message:ChatMessage)=>void,disabled=false){
 const [phase,setPhase]=useState<'idle'|'requesting'|'recording'|'finishing'|'review'|'sending'>('idle'),[seconds,setSeconds]=useState(0),[analyser,setAnalyser]=useState<AnalyserNode>(),[draft,setDraft]=useState<Draft>(),[error,setError]=useState('');
 const capture=useRef<Capture|undefined>(undefined),currentDraft=useRef<Draft|undefined>(undefined),epoch=useRef(0),alive=useRef(true),working=useRef(false),trigger=useRef<HTMLButtonElement>(null);
 const sent=useRef(onSent);sent.current=onSent;
 const revoke=()=>{if(currentDraft.current)URL.revokeObjectURL(currentDraft.current.url);currentDraft.current=undefined;};
 function stop(){const current=capture.current;if(!current||current.recorder.state==='inactive')return;setPhase('finishing');clearInterval(current.timer);current.recorder.stop();current.stream.getTracks().forEach(track=>track.stop());}
 function cancel(){epoch.current++;working.current=false;const current=capture.current;capture.current=undefined;if(current){if(current.recorder.state!=='inactive')current.recorder.stop();release(current);}void window.discorda?.voiceRecording(false).catch(()=>{});revoke();setDraft(undefined);setAnalyser(undefined);setSeconds(0);setPhase('idle');setError('');requestAnimationFrame(()=>trigger.current?.focus());}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;const current=capture.current;capture.current=undefined;if(current){if(current.recorder.state!=='inactive')current.recorder.stop();release(current);}revoke();void window.discorda?.voiceRecording(false).catch(()=>{});};},[]);
 useEffect(()=>{if(phase!=='recording'&&phase!=='requesting')return;const suspend=()=>cancel();return window.discorda?.onPowerState(state=>{if(state==='suspend')suspend();});},[phase]);
 async function start(){
  if(working.current||disabled||phase!=='idle')return;working.current=true;const revision=++epoch.current;setError('');setSeconds(0);setPhase('requesting');
  let stream:MediaStream|undefined,context:AudioContext|undefined,processor:MicrophoneProcessor|undefined;
  try{
   if(!MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))throw Error('Este computador não oferece o formato de gravação necessário.');
   window.dispatchEvent(new CustomEvent(audioPlaybackEvent,{detail:'recording'}));
   await window.discorda!.voiceRecording(true);if(revision!==epoch.current)return;
   const settings=readMicrophoneSettings();
   stream=await navigator.mediaDevices.getUserMedia({audio:voiceCaptureOptions(settings),video:false});
   if(revision!==epoch.current){stream.getTracks().forEach(track=>track.stop());return;}
   context=new AudioContext({sampleRate:48000,latencyHint:'interactive'});await context.resume();if(revision!==epoch.current){stream.getTracks().forEach(track=>track.stop());await context.close();return;}
   processor=new MicrophoneProcessor({...settings,gate:false,pushToTalk:false});await processor.init({audioContext:context,track:stream.getAudioTracks()[0],kind:Track.Kind.Audio});
   if(revision!==epoch.current){stream.getTracks().forEach(track=>track.stop());await processor.destroy();await context.close();return;}
   const output=new MediaStream([processor.processedTrack!]),source=context.createMediaStreamSource(output),analyser=context.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.65;source.connect(analyser);
   const recorder=new MediaRecorder(output,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:64000});
   const current:Capture={recorder,stream,context,source,processor,analyser,output,chunks:[],size:0,started:performance.now()};capture.current=current;
   recorder.ondataavailable=event=>{if(revision!==epoch.current||!event.data.size)return;current.chunks.push(event.data);current.size+=event.data.size;if(current.size>maxBytes){setError('O áudio atingiu o limite de tamanho. Grave uma mensagem mais curta.');stop();}};
   recorder.onstop=()=>{
    const duration=Math.min(maxSeconds,(performance.now()-current.started)/1000),blob=new Blob(current.chunks,{type:'audio/webm;codecs=opus'});release(current);
    if(capture.current===current)capture.current=undefined;if(revision!==epoch.current||!alive.current)return;
    void window.discorda?.voiceRecording(false).catch(()=>{});working.current=false;setAnalyser(undefined);
    if(duration<.5||blob.size===0||blob.size>maxBytes){setPhase('idle');setError(duration<.5?'Grave pelo menos meio segundo antes de concluir.':'Não foi possível guardar o áudio. Grave novamente.');return;}
    const ready={blob,url:URL.createObjectURL(blob),duration,id:crypto.randomUUID()};currentDraft.current=ready;setDraft(ready);setSeconds(duration);setPhase('review');
   };
   recorder.onerror=()=>{if(revision!==epoch.current)return;cancel();setError('A gravação foi interrompida. Confira o microfone e grave novamente.');};
   stream.getAudioTracks()[0].addEventListener('ended',()=>{if(revision===epoch.current&&recorder.state==='recording'){setError('O microfone foi desconectado. Você pode revisar o trecho gravado.');stop();}});
   recorder.start(250);setAnalyser(analyser);setPhase('recording');
   current.timer=setInterval(()=>{if(revision!==epoch.current)return;const elapsed=(performance.now()-current.started)/1000;setSeconds(Math.min(maxSeconds,elapsed));if(elapsed>=maxSeconds)stop();},100);
  }catch(e){await processor?.destroy();stream?.getTracks().forEach(track=>track.stop());if(context?.state!=='closed')void context?.close().catch(()=>{});if(revision===epoch.current&&alive.current){capture.current=undefined;working.current=false;void window.discorda?.voiceRecording(false).catch(()=>{});setPhase('idle');setError(e instanceof DOMException?mediaErrorMessage(e):e instanceof Error?e.message:'Não foi possível gravar o áudio.');}}
 }
 async function send(){
  const current=currentDraft.current;if(!current||working.current)return;working.current=true;const revision=epoch.current;setPhase('sending');setError('');window.dispatchEvent(new CustomEvent(audioPlaybackEvent,{detail:'sending'}));
  try{const bytes=new Uint8Array(await current.blob.arrayBuffer());const result=await window.discorda!.chat({kind:'voiceSend',channelId,clientId:current.id,bytes,durationMs:Math.max(500,Math.min(120000,Math.round(current.duration*1000)))});if(!result.ok)throw Error(result.message);if(!alive.current||revision!==epoch.current)return;sent.current(result.data as ChatMessage);revoke();setDraft(undefined);setPhase('idle');setSeconds(0);requestAnimationFrame(()=>trigger.current?.focus());}
  catch(e){if(alive.current&&revision===epoch.current){setError(e instanceof Error?e.message:'Falha ao enviar. Seu áudio continua aqui para tentar novamente.');setPhase('review');}}
  finally{if(revision===epoch.current)working.current=false;}
 }
 const active=phase!=='idle';
 return {active,button:<button ref={trigger} type="button" className="record-voice-trigger" aria-label="Gravar mensagem de voz" title="Gravar mensagem de voz" disabled={disabled||active} onClick={()=>void start()}><Mic size={20}/></button>,panel:<>
  {active&&<aside className={'voice-recorder '+(phase==='recording'?'is-recording':'')} aria-label="Gravar mensagem de voz">
   {(phase==='recording'||phase==='requesting'||phase==='finishing')&&<div className="voice-record-row"><button type="button" className="voice-discard" aria-label="Descartar gravação" onClick={cancel}><Trash2 size={19}/></button><span className="voice-recorder-clock">{phase==='recording'&&<i/>}{audioTime(seconds)}</span><div className="voice-recording-visual">{phase==='recording'?<AudioSpectrum analyser={analyser} active label="Onda da gravação em tempo real"/>:<span className="voice-record-status"><LoaderCircle size={16} className="animate-spin"/>{phase==='requesting'?'Preparando o microfone':'Finalizando áudio…'}</span>}</div>{phase==='recording'&&<button type="button" className="voice-finish" aria-label="Concluir gravação" onClick={stop}><Square size={14} fill="currentColor"/><span>Concluir</span></button>}</div>}
   {draft&&<><AudioMessage src={draft.url} duration={draft.duration} label="Ouvir gravação antes de enviar"/><div className="voice-review-actions"><button type="button" className="voice-discard" aria-label="Descartar gravação" disabled={phase==='sending'} onClick={cancel}><Trash2 size={18}/></button><span className="voice-review-hint">Ouça antes de enviar</span><button type="button" className="voice-send" disabled={phase==='sending'} onClick={()=>void send()}>{phase==='sending'?<LoaderCircle className="animate-spin" size={16}/>:<Send size={16}/>}<span>{phase==='sending'?'Enviando…':'Enviar áudio'}</span></button></div></>}
  </aside>}
  {error&&<p className="voice-recorder-error" role="alert">{error}</p>}
 </>};
}
