import {useEffect, useId, useRef, useState} from 'react';
import {Check, ChevronDown} from 'lucide-react';

export type SelectOption<T extends string> = {value:T; label:string; description?:string};

/** A styled single-select with keyboard navigation and focus kept inside the modal. */
export function Select<T extends string>({label,value,options,onChange,disabled=false}:{
  label:string; value:T; options:readonly SelectOption<T>[]; onChange:(value:T)=>void; disabled?:boolean;
}) {
  const id=useId(), root=useRef<HTMLDivElement>(null), trigger=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false), [active,setActive]=useState(0);
  const selected=options.find(option=>option.value===value)??options[0];
  useEffect(()=>{
    if(open)root.current?.querySelectorAll<HTMLElement>('[role=option]')[active]?.scrollIntoView({block:'nearest'});
  },[open,active]);
  useEffect(()=>{
    if(!open)return;
    const dismiss=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',dismiss);
    return()=>document.removeEventListener('pointerdown',dismiss);
  },[open]);
  function reveal(last=false){setActive(last?options.length-1:Math.max(0,options.findIndex(option=>option.value===value)));setOpen(true);}
  return <div className="custom-select" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <span className="custom-select-label" id={id+'-label'}>{label}</span>
    <button ref={trigger} type="button" className="custom-select-trigger" role="combobox" aria-labelledby={id+'-label'} aria-expanded={open} aria-controls={id+'-list'} aria-haspopup="listbox" aria-activedescendant={open?id+'-'+active:undefined} disabled={disabled} onClick={()=>open?setOpen(false):reveal()} onKeyDown={event=>{
      if(['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape'].includes(event.key)){
        if(event.key==='Escape'&&!open)return;
        event.preventDefault();event.stopPropagation();
        if(event.key==='Escape'){setOpen(false);return;}
        if(event.key==='Enter'||event.key===' '){if(open){onChange(options[active].value);setOpen(false);}else reveal();return;}
        if(!open){reveal(event.key==='End');return;}
        setActive(index=>event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length);
      }else if(event.key.length===1){
        const index=options.findIndex(option=>option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
        if(index>=0){event.preventDefault();setActive(index);setOpen(true);}
      }
    }}><span><strong>{selected.label}</strong>{selected.description&&<small>{selected.description}</small>}</span><ChevronDown size={16}/></button>
    {open&&!disabled&&<div className="custom-select-menu" id={id+'-list'} role="listbox" aria-labelledby={id+'-label'}>
      {options.map((option,index)=><div key={option.value} id={id+'-'+index} role="option" aria-selected={option.value===value} className={active===index?'active':''} onPointerMove={()=>setActive(index)} onMouseDown={event=>event.preventDefault()} onClick={()=>{onChange(option.value);setOpen(false);trigger.current?.focus();}}>
        <span><strong>{option.label}</strong>{option.description&&<small>{option.description}</small>}</span>{option.value===value&&<Check size={16}/>}
      </div>)}
    </div>}
  </div>;
}
