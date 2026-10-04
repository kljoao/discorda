import {useEffect,useRef,useState} from 'react';
import {mediaErrorMessage} from './media-errors';

type Result={label:string;message:string;state:'ok'|'attention'|'pending'};
export function CallCheck({input,output,callActive}:{input:string;output:string;callActive:boolean}){
 const [results,setResults]=useState<Result[]>([]),[busy,setBusy]=useState(false),[heard,setHeard]=useState<boolean>();
 const epoch=useRef(0),cleanup=useRef<()=>void>(()=>{});
 function cancel(){epoch.current++;cleanup.current();cleanup.current=()=>{};setBusy(false);setResults(previous=>previous.map(result=>result.state==='pending'?{...result,state:'attention',message:'Teste cancelado. Execute novamente quando quiser.'}:result));}
 useEffect(()=>()=>{epoch.current++;cleanup.current();},[]);
 async function run(){
  if(busy||callActive)return;
  const ticket=++epoch.current;setBusy(true);setHeard(undefined);
  const items:Result[]=[{label:'Servidor e banco',message:'Verificando…',state:'pending'},{label:'Microfone',message:'Fale uma frase durante o teste de 6 segundos.',state:'pending'},{label:'Saída de áudio',message:'Aguardando o teste do microfone.',state:'pending'}];
  const put=(index:number,result:Result)=>{items[index]=result;if(epoch.current===ticket)setResults([...items]);};setResults([...items]);
  let stream:MediaStream|undefined,context:AudioContext|undefined,monitor:HTMLAudioElement|undefined,timer:ReturnType<typeof setTimeout>|undefined,release:(()=>void)|undefined;
  const stop=()=>{clearTimeout(timer);release?.();stream?.getTracks().forEach(t=>t.stop());if(monitor){monitor.pause();monitor.srcObject=null;}if(context&&context.state!=='closed')void context.close().catch(()=>{});if(cleanup.current===stop)void window.discorda?.microphoneTest(false).catch(()=>{});};
  cleanup.current=stop;
  const network=window.discorda!.checkServices().then(s=>put(0,{label:'Servidor e banco',state:s.api==='online'&&s.database==='ready'?'ok':'attention',message:s.api!=='online'?'Servidor não respondeu. Confira sua rede e o endereço do grupo.':s.database!=='ready'?'Servidor respondeu, mas o banco precisa de atenção do administrador.':'API e banco responderam. A conexão de mídia é verificada ao entrar na sala.'})).catch(()=>put(0,{label:'Servidor e banco',state:'attention',message:'Não foi possível consultar. Tente novamente.'}));
  try{try{
   await window.discorda!.microphoneTest(true);if(epoch.current!==ticket)return;
   stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:input?{exact:input}:undefined,echoCancellation:true,noiseSuppression:true},video:false});
   if(epoch.current!==ticket)return;
   context=new AudioContext();await context.resume();const analyser=context.createAnalyser();analyser.fftSize=1024;context.createMediaStreamSource(stream).connect(analyser);
   const samples=new Float32Array(analyser.fftSize);let peak=0,clipped=false;
   await new Promise<void>(resolve=>{release=resolve;const end=Date.now()+6000;const sample=()=>{if(epoch.current!==ticket||Date.now()>=end){resolve();return;}analyser.getFloatTimeDomainData(samples);let sum=0;for(const value of samples){sum+=value*value;if(Math.abs(value)>0.98)clipped=true;}peak=Math.max(peak,Math.sqrt(sum/samples.length));timer=setTimeout(sample,80);};sample();});
   stream.getTracks().forEach(t=>t.stop());if(epoch.current!==ticket)return;
   put(1,{label:'Microfone',state:peak<0.003||clipped?'attention':'ok',message:peak<0.003?'Microfone aberto, mas sem sinal suficiente. Confira o mute físico, a entrada selecionada e o volume no Windows.':clipped?'Sinal detectado com picos muito altos. Reduza o volume de entrada.':'Sua voz chegou ao aplicativo. O teste não foi transmitido nem gravado.'});
  }catch(error){put(1,{label:'Microfone',state:'attention',message:mediaErrorMessage(error)});}
  finally{stream?.getTracks().forEach(t=>t.stop());}
  try{
   if(epoch.current!==ticket)return;
   context??=new AudioContext();await context.resume();const destination=context.createMediaStreamDestination(),gain=context.createGain(),tone=context.createOscillator();gain.gain.value=0.06;tone.frequency.value=440;tone.connect(gain).connect(destination);monitor=new Audio();monitor.srcObject=destination.stream;if(output)await monitor.setSinkId(output);await monitor.play();
   await new Promise<void>(resolve=>{release=resolve;tone.onended=()=>resolve();tone.start();tone.stop(context!.currentTime+0.6);timer=setTimeout(resolve,2000);});
   put(2,{label:'Saída de áudio',state:'attention',message:'O sinal foi reproduzido. Confirme abaixo se você ouviu nos fones.'});
  }catch{put(2,{label:'Saída de áudio',state:'attention',message:'Não foi possível abrir a saída selecionada. Escolha seus fones em Dispositivos.'});}
  finally{stream?.getTracks().forEach(t=>t.stop());}
  }finally{stop();await network;if(epoch.current===ticket){cleanup.current=()=>{};setBusy(false);}}
 }
 return <section className="call-check"><h3>Teste sua chamada</h3><p>Verifica o servidor, escuta o microfone por 6 segundos e toca um sinal baixo nos fones. Use fones; nenhum áudio é enviado ou salvo.</p><button disabled={callActive} onClick={()=>busy?cancel():void run()}>{busy?'Cancelar teste':'Testar minha chamada'}</button>{callActive&&<p>Saia da chamada para testar os dispositivos sem interferir na conversa.</p>}<ol aria-live="polite" aria-busy={busy}>{results.map(result=><li key={result.label} data-state={result.state}><strong>{result.label}</strong><span>{result.message}</span></li>)}</ol>{!busy&&results[2]?.message.startsWith('O sinal')&&<div role="group" aria-label="Você ouviu o sinal?"><button aria-pressed={heard===true} onClick={()=>setHeard(true)}>Ouvi o sinal</button><button aria-pressed={heard===false} onClick={()=>setHeard(false)}>Não ouvi</button><p role="status">{heard===true?'Saída confirmada.':heard===false?'Confira o volume do Windows e selecione outra saída em Dispositivos.':''}</p></div>}</section>;
}
