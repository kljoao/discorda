import {useEffect} from 'react';
import {privateSharing} from './privacy';
// A navigation request alone is not a read receipt. Wait until the actual row is visible.
export function useVisibleReceipt(id:string|undefined,enabled:boolean,revision:unknown){
 useEffect(()=>{
  if(!enabled||!id||!/^\d+$/.test(id))return;
  const row=document.querySelector<HTMLElement>('[data-inbox-id="'+id+'"]');if(!row)return;
  let timer:ReturnType<typeof setTimeout>|undefined,visible=false,sent=false,alive=true;
  const allowed=()=>visible&&document.visibilityState==='visible'&&document.hasFocus()&&!document.querySelector('dialog[open]')&&!privateSharing();
  const schedule=()=>{clearTimeout(timer);if(sent||!allowed())return;timer=setTimeout(()=>{if(!alive||!allowed())return;sent=true;void window.discorda?.chat({kind:'inboxRead',id}).then(r=>{if(!r.ok)sent=false;}).catch(()=>{sent=false;});},750);};
  const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting&&e.intersectionRatio>=.5);schedule();},{threshold:[0,.5]});observer.observe(row);
  window.addEventListener('focus',schedule);window.addEventListener('blur',schedule);document.addEventListener('visibilitychange',schedule);
  return()=>{alive=false;clearTimeout(timer);observer.disconnect();window.removeEventListener('focus',schedule);window.removeEventListener('blur',schedule);document.removeEventListener('visibilitychange',schedule);};
 },[id,enabled,revision]);
}
