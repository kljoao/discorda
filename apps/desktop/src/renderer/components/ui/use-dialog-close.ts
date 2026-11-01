import {useEffect,useRef,useState} from 'react';
export function useDialogClose(onClose:()=>void){
 const [closing,setClosing]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 function dismiss(){if(timer.current)return;setClosing(true);const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='reduced';timer.current=setTimeout(onClose,reduced?0:160);}
 return {closing,dismiss};
}
