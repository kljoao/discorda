/** Local viewer transform only: never changes the captured or published track. */
export function bindStreamZoom(video:HTMLVideoElement,viewport:HTMLElement,controls:HTMLElement){
 const doc=video.ownerDocument;let scale=1,x=0,y=0,drag:{id:number;x:number;y:number}|undefined;
 const label=doc.createElement('output'),fit=doc.createElement('button'),original=doc.createElement('button'),minus=doc.createElement('button'),plus=doc.createElement('button');
 fit.textContent='Ajustar';original.textContent='Tamanho original';minus.textContent='−';plus.textContent='+';
 minus.setAttribute('aria-label','Diminuir zoom');plus.setAttribute('aria-label','Aumentar zoom');label.setAttribute('aria-label','Zoom da transmissão');
 controls.append(minus,label,plus,fit,original);viewport.tabIndex=0;viewport.setAttribute('aria-label','Transmissão: use a roda para ampliar e arraste para navegar');
 function render(){const width=viewport.clientWidth,height=viewport.clientHeight;x=Math.max(-Math.max(0,width*(scale-1)/2),Math.min(Math.max(0,width*(scale-1)/2),x));y=Math.max(-Math.max(0,height*(scale-1)/2),Math.min(Math.max(0,height*(scale-1)/2),y));video.style.transform=`translate(${x}px,${y}px) scale(${scale})`;label.value=Math.round(scale*100)+'%';viewport.style.cursor=scale>1?'grab':'default';}
 function zoom(value:number){scale=Math.max(.1,Math.min(8,value));render();}
 fit.onclick=()=>{x=y=0;zoom(1);};original.onclick=()=>{const ratio=Math.min(viewport.clientWidth/(video.videoWidth||1),viewport.clientHeight/(video.videoHeight||1));zoom(ratio>0?1/ratio:1);};minus.onclick=()=>zoom(scale/1.25);plus.onclick=()=>zoom(scale*1.25);
 const wheel=(e:WheelEvent)=>{e.preventDefault();zoom(scale*Math.exp(-e.deltaY*.002));};
 const down=(e:PointerEvent)=>{if(e.button!==0||scale<=1)return;drag={id:e.pointerId,x:e.clientX-x,y:e.clientY-y};viewport.setPointerCapture(e.pointerId);};
 const move=(e:PointerEvent)=>{if(drag?.id!==e.pointerId)return;x=e.clientX-drag.x;y=e.clientY-drag.y;render();};
 const up=()=>{drag=undefined;};const key=(e:KeyboardEvent)=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoom(scale*1.25);}else if(e.key==='-'){e.preventDefault();zoom(scale/1.25);}else if(e.key==='0'){e.preventDefault();zoom(1);}};
 viewport.addEventListener('wheel',wheel,{passive:false});viewport.addEventListener('pointerdown',down);viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',up);viewport.addEventListener('pointercancel',up);viewport.addEventListener('keydown',key);
 const observer=new ResizeObserver(render);observer.observe(viewport);render();
 return()=>{observer.disconnect();viewport.removeEventListener('wheel',wheel);viewport.removeEventListener('pointerdown',down);viewport.removeEventListener('pointermove',move);viewport.removeEventListener('pointerup',up);viewport.removeEventListener('pointercancel',up);viewport.removeEventListener('keydown',key);video.style.transform='';controls.replaceChildren();};
}
