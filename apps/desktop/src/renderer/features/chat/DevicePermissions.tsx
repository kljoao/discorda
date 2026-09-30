import {useState} from 'react';
export function DevicePermissions() {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function authorize(){if(busy)return;setBusy(true);setMessage('');const results:string[]=[];
    try {await window.discorda!.devicePermissions('request');
      for(const device of ['audio','video'] as const){try{const stream=await navigator.mediaDevices.getUserMedia({[device]:true});stream.getTracks().forEach(t=>t.stop());results.push(device==='audio'?'Microfone autorizado.':'Câmera autorizada.');}
        catch(error){const unavailable=error instanceof DOMException&&error.name==='NotFoundError';results.push(`${device==='audio'?'Microfone':'Câmera'}: ${unavailable?'dispositivo não encontrado.':'bloqueado ou em uso. Confira as configurações abaixo.'}`);}}
      setMessage(results.join(' '));
    }catch{setMessage('Não foi possível solicitar acesso. Entre novamente na sua conta.');}finally{setBusy(false);}}
  return <div className="device-permissions"><button disabled={busy} onClick={()=>void authorize()}>{busy?'Verificando dispositivos…':'Autorizar microfone e câmera'}</button><p>Solicita acesso e faz uma verificação breve. Os dispositivos são desligados em seguida.</p><div><button onClick={()=>void window.discorda?.devicePermissions('microphone')}>Microfone no Windows</button><button onClick={()=>void window.discorda?.devicePermissions('camera')}>Câmera no Windows</button></div><p role="status">{message}</p></div>;
}
