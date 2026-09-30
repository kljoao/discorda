import { useEffect, useRef, useState } from 'react';
import { Track } from 'livekit-client';
import { MicrophoneProcessor, type MicrophoneSettings } from './microphone';

export function MicrophoneControls({settings, change, callActive, level, onTesting}: {settings:MicrophoneSettings; change:(s:MicrophoneSettings)=>void;callActive:boolean;level:{db:number;open:boolean};onTesting:(value:boolean)=>void}) {
  const [testing,setTesting]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [testLevel,setTestLevel]=useState({db:-90,open:false});
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const running = useRef<{context:AudioContext;stream:MediaStream;processor:MicrophoneProcessor;monitor:HTMLAudioElement}|undefined>(undefined);
  const epoch = useRef(0);
  const mounted = useRef(true);
  async function stop() {
    epoch.current++; const current=running.current;running.current=undefined;
    if(current){current.monitor.pause();current.monitor.srcObject=null;current.stream.getTracks().forEach(t=>t.stop());await current.processor.destroy();if(current.context.state!=='closed')await current.context.close();}
    void window.discorda?.microphoneTest(false);
    if(mounted.current){setTesting(false);setTestLevel({db:-90,open:false});}onTesting(false);
  }
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;void stop();};},[]);
  useEffect(()=>{running.current?.processor.configure(settings);},[settings]);
  useEffect(()=>{if(!testing)return;const timer=setTimeout(()=>{void stop();},60000);return()=>clearTimeout(timer);},[testing]);
  async function start() {
    if(busy||callActive)return;setBusy(true);setError('');onTesting(true);const revision=++epoch.current;
    let stream:MediaStream|undefined, context:AudioContext|undefined, processor:MicrophoneProcessor|undefined;
    try {
      await window.discorda!.microphoneTest(true);
      if(revision!==epoch.current)return;
      const inputs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');
      if(mounted.current)setDevices(inputs);
      stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:settings.deviceId?{exact:settings.deviceId}:undefined,echoCancellation:true,noiseSuppression:settings.noiseSuppression!==false,autoGainControl:true},video:false});
      if(revision!==epoch.current) {stream.getTracks().forEach(t=>t.stop());return;}
      context=new AudioContext();processor=new MicrophoneProcessor(settings);processor.onLevel=value=>{if(mounted.current)setTestLevel(value);};
      await processor.init({audioContext:context,track:stream.getAudioTracks()[0],kind:Track.Kind.Audio});
      if(revision!==epoch.current){stream.getTracks().forEach(t=>t.stop());await processor.destroy();await context.close();return;}
      const monitor=new Audio();monitor.srcObject=new MediaStream([processor.processedTrack!]);
      running.current={context,stream,processor,monitor};await monitor.play();
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'));setTesting(true);
    } catch {
      stream?.getTracks().forEach(t=>t.stop());await processor?.destroy();if(context?.state!=='closed')await context?.close();
      await stop();if(mounted.current)setError('Não foi possível testar. Confira o dispositivo e a permissão de microfone no Windows.');
    } finally {if(mounted.current)setBusy(false);if(!running.current)onTesting(false);}
  }
  const current=testing?testLevel:level;
  return <div className="microphone-controls">
    <h3>Microfone</h3><p>O teste é local e termina após 60 segundos. Use fones para evitar retorno.</p>
    <label>Volume de entrada: {Math.round(settings.gain*100)}%<input aria-label="Volume de entrada" type="range" min="0" max="200" value={Math.round(settings.gain*100)} onChange={e=>change({...settings,gain:Number(e.target.value)/100})}/></label>
    <label><input type="checkbox" checked={settings.noiseSuppression!==false} disabled={testing} onChange={e=>change({...settings,noiseSuppression:e.target.checked})}/> Supressão de ruído</label><p>Reduz ruídos contínuos, como ventilador. Cancelamento de eco permanece ativo. Para comparar no teste, pare e inicie novamente.</p>
    <label><input type="checkbox" checked={settings.gate} onChange={e=>change({...settings,gate:e.target.checked})}/> Ativação por voz</label>
    <label>Limiar de ativação: {settings.threshold} dB<input aria-label="Sensibilidade do microfone" type="range" min="-70" max="-10" disabled={!settings.gate} value={settings.threshold} onChange={e=>change({...settings,threshold:Number(e.target.value)})}/></label>
    <p>Mais à esquerda capta sons mais baixos. Mais à direita exige uma voz mais forte.</p>
    <label>Nível de entrada<meter aria-label="Nível do microfone" min="-90" max="0" value={current.db}/><output>{current.db.toFixed(0)} dB · {current.open?'Som liberado':'Abaixo do limiar'}</output></label>
    <button disabled={busy || callActive} onClick={()=>void(testing?stop():start())}>{testing?'Parar teste':'Testar microfone'}</button>
    {callActive&&<p>Silencie seu microfone na chamada antes de testar sem transmitir.</p>}
    {!!devices.length&&<label>Microfone para o teste<select aria-label="Microfone para o teste" value={settings.deviceId} disabled={testing||busy} onChange={e=>change({...settings,deviceId:e.target.value})}><option value="">Padrão do sistema</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'Microfone'}</option>)}</select></label>}
    {error&&<p role="alert" className="voice-error">{error}</p>}
  </div>;
}
