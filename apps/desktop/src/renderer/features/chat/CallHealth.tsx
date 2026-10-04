import {useEffect,useRef,useState} from 'react';
import {Track,type Room} from 'livekit-client';
import type {VoicePlayback} from './playback';
import type {MicrophoneSettings} from './microphone';

export function CallHealth({room,level,settings,deaf,output,onSettings,playback,onRepair}:{playback?:VoicePlayback;onRepair:()=>void;room:Room;level:{db:number;open:boolean};settings:MicrophoneSettings;deaf:boolean;output:string;onSettings:()=>void}){
 const latest=useRef({level,settings,deaf,output,playback});latest.current={level,settings,deaf,output,playback};
 const [hint,setHint]=useState(''),[dismissed,setDismissed]=useState('');
 useEffect(()=>{let alive=true,busy=false,previousBytes:number|undefined,stalled=0,gate=0,lossRuns=0,silent=0;const previous=new Map<string,{received:number;lost:number}>();
  async function sample(){if(busy)return;busy=true;try{
   const {level,settings,deaf,output,playback}=latest.current;
   const publication=room.localParticipant.getTrackPublication(Track.Source.Microphone);
   const microphone=publication?.track?.mediaStreamTrack;
   const reports=await Promise.all([Promise.resolve(publication?.track?.getRTCStatsReport()).catch(()=>undefined),Promise.resolve(room.engine.pcManager?.subscriber?.getStats()).catch(()=>undefined)]);
   let bytes=0,found=false,received=0,lost=0;const seen=new Set<string>();
   for(const report of reports)report?.forEach(stat=>{if((stat.kind??stat.mediaType)!=='audio')return;
    if(stat.type==='outbound-rtp'){found=true;bytes+=stat.bytesSent??0;}
    if(stat.type==='inbound-rtp'){seen.add(stat.id);const old=previous.get(stat.id);if(old){received+=Math.max(0,(stat.packetsReceived??0)-old.received);lost+=Math.max(0,(stat.packetsLost??0)-old.lost);}previous.set(stat.id,{received:stat.packetsReceived??0,lost:stat.packetsLost??0});}
   });for(const id of previous.keys())if(!seen.has(id))previous.delete(id);
   const transmitting=room.localParticipant.isMicrophoneEnabled&&!deaf;
   stalled=transmitting&&level.open&&level.db>-55&&found&&previousBytes===bytes?stalled+1:0;
   gate=transmitting&&!settings.pushToTalk&&settings.gate&&level.db>-55&&!level.open?gate+1:0;
   lossRuns=received+lost>0&&lost/(received+lost)>0.05?lossRuns+1:0;
   silent=transmitting&&!settings.pushToTalk&&microphone?.readyState==='live'&&level.db<=-65?silent+1:0;
   previousBytes=found?bytes:undefined;
   const devices=output&&output!=='default'?await navigator.mediaDevices.enumerateDevices():[];
   const message=!deaf&&playback?.context.state==='suspended'?'A reprodução de áudio foi suspensa. Retome o som e confira seus fones.':microphone?.readyState==='ended'?'O microfone foi desconectado. Selecione uma entrada disponível.':output&&output!=='default'&&!devices.some(d=>d.kind==='audiooutput'&&d.deviceId===output)?'A saída de áudio selecionada não está disponível. Escolha seus fones novamente.':stalled>=3?'Há sinal no microfone, mas o envio de áudio parece parado. Confira a entrada e reconecte à chamada se continuar.':gate>=3?'A sensibilidade pode estar cortando sua voz. Abra as configurações e reduza o limite de ativação.':silent>=8?'Nenhum sinal detectado no microfone há 16 segundos. Se você está falando, confira a entrada escolhida, o botão físico de mute e a permissão do Windows.':lossRuns>=3?'A chamada está perdendo pacotes. Experimente economizar dados nas transmissões e conferir sua conexão.':'';
   if(alive)setHint(message);
  }catch{/* Missing stats are inconclusive, never a microphone failure. */}finally{busy=false;}}
  const timer=setInterval(()=>void sample(),2000);return()=>{alive=false;clearInterval(timer);};
 },[room]);
 if(!hint||hint===dismissed)return null;
 return <aside className="call-health" role="status"><strong>Vamos conferir seu áudio</strong><p>{hint}</p><button onClick={onRepair}>Retomar e testar som</button><button onClick={onSettings}>Abrir ajustes de áudio</button><button aria-label="Dispensar dica" onClick={()=>setDismissed(hint)}>×</button></aside>;
}
