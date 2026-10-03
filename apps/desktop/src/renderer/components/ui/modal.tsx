import {useEffect,useRef,type ReactNode} from 'react';

/** Native modality keeps keyboard focus and pointer actions out of the background. */
export function Modal({children,label,className,onClose}:{children:ReactNode;label:string;className:string;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const previous=document.activeElement;
    const dialog=ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return()=>{dialog.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
  },[]);
  return <dialog ref={ref} aria-label={label} className={className} onCancel={event=>{event.preventDefault();onClose();}}>{children}</dialog>;
}
