import {useEffect,useState} from 'react';
import type {ShortcutSettings} from '../../../shared/ipc/contracts';

export function AudioSetup({output}:{output:string}){
  const [step,setStep]=useState(0),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function test(){setBusy(true);setMessage('');const context=new AudioContext();const audio=new Audio();try{
    const stream=context.createMediaStreamDestination(),gain=context.createGain(),tone=context.createOscillator();
    tone.frequency.value=440;gain.gain.value=0.08;tone.connect(gain).connect(stream);audio.srcObject=stream.stream;
    if(output)await audio.setSinkId(output);await context.resume();await audio.play();tone.start();tone.stop(context.currentTime+0.6);
    await new Promise<void>(resolve=>{tone.onended=()=>resolve();});setMessage('Você ouviu o sinal? Se não, confira a saída em Dispositivos.');
  }catch{setMessage('Não foi possível testar essa saída. Selecione seus fones novamente.');}finally{audio.pause();audio.srcObject=null;await context.close();setBusy(false);}}
  return <section className="audio-setup"><h3>Prepare sua chamada</h3><div className="setup-steps" role="group" aria-label="Etapas do teste">{['1 · Fones','2 · Microfone','3 · Ruído'].map((label,i)=><button key={label} aria-pressed={step===i} onClick={()=>setStep(i)}>{label}</button>)}</div>
    <p>{step===0?'Coloque seus fones e confira se o som chega à saída escolhida.':step===1?'Use “Testar microfone” abaixo e fale uma frase no seu volume habitual. Ajuste a entrada se estiver muito baixa ou distorcida.':'Durante o teste, alterne a supressão de ruído. Compare sua voz e o ruído do ambiente; o teste fica somente neste computador.'}</p>
    {step===0&&<button disabled={busy} onClick={()=>void test()}>{busy?'Reproduzindo…':'Ouvir sinal nos fones'}</button>}<p role="status">{message}</p>
  </section>;
}
export const defaultShortcuts:ShortcutSettings={enabled:false,pushToTalk:false,mute:'Control+Shift+M',talk:'F9',deafen:'Control+Shift+D',cinema:'Control+Shift+F'};
export function readShortcuts():ShortcutSettings{try{const s=JSON.parse(localStorage.getItem('discorda:shortcuts')??'null');return s&&typeof s.enabled==='boolean'&&typeof s.pushToTalk==='boolean'&&typeof s.mute==='string'&&typeof s.talk==='string'?{...defaultShortcuts,...s}:defaultShortcuts;}catch{return defaultShortcuts;}}
export function ShortcutControls({value,change,error}:{value:ShortcutSettings;change:(value:ShortcutSettings)=>void;error?:string}){
  return <section className="shortcut-settings"><h3>Atalhos durante jogos</h3>{error&&<p role="alert">{error}</p>}<label><input type="checkbox" checked={value.enabled} onChange={e=>change({...value,enabled:e.target.checked})}/> Usar atalhos globais</label>
    {(['mute','deafen','cinema'] as const).map(kind=><label key={kind}>{kind==='mute'?'Alternar microfone':kind==='deafen'?'Ensurdecer':'Modo cinema'}<input readOnly disabled={!value.enabled} aria-label={'Atalho '+kind} placeholder="Clique e pressione Ctrl/Alt + tecla" value={value[kind]??''} onKeyDown={e=>{if(e.key==='Tab')return;e.preventDefault();if(e.key==='Backspace'&&kind!=='mute'){change({...value,[kind]:''});return;}const key=e.key.toUpperCase();if(/^F([1-9]|1[0-2])$/.test(key)||(/^[A-Z0-9]$/.test(key)&&(e.ctrlKey||e.altKey))){change({...value,[kind]:(/^F([1-9]|1[0-2])$/.test(key)?'':(e.ctrlKey?'Control+':'')+(e.altKey?'Alt+':'')+(e.shiftKey?'Shift+':''))+key});}}}/></label>)}
    <label><input type="checkbox" checked={value.pushToTalk} disabled={!value.enabled} onChange={e=>change({...value,pushToTalk:e.target.checked})}/> Pressionar para falar</label><label>Tecla para falar<select disabled={!value.enabled||!value.pushToTalk} value={value.talk} onChange={e=>change({...value,talk:e.target.value})}>{Array.from({length:12},(_,i)=>'F'+(i+1)).map(key=><option key={key}>{key}</option>)}</select></label>
    <p>Ative o microfone na chamada e mantenha a tecla pressionada. Funciona com o Discorda em segundo plano no Windows. A tecla continua disponível para o jogo; escolha uma sem conflito.</p>
  </section>;
}
