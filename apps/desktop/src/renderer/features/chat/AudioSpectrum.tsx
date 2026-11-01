import {useEffect,useRef} from 'react';

/** A quiet waveform driven by the actual audio samples; played bars follow the playhead. */
export function AudioSpectrum({analyser,active,label,progress}:{analyser?:AnalyserNode;active:boolean;label:string;progress?:number}){
 const canvas=useRef<HTMLCanvasElement>(null),played=useRef(progress),lastBars=useRef<number[]>([]),paint=useRef<((time:number)=>void)|undefined>(undefined);played.current=progress;
 useEffect(()=>{
  const node=canvas.current!,context=node.getContext('2d');if(!context)return;
  const samples=new Float32Array(analyser?.fftSize??1024);let frame=0,last=0;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches||document.documentElement.dataset.motion==='reduced';
  function draw(now:number){
   if(now-last<(reduced?100:33))return;last=now;
   const width=Math.max(60,node.clientWidth),height=node.clientHeight||38,ratio=Math.min(devicePixelRatio||1,2);
   if(node.width!==Math.round(width*ratio)||node.height!==Math.round(height*ratio)){node.width=Math.round(width*ratio);node.height=Math.round(height*ratio);}
   context!.setTransform(ratio,0,0,ratio,0,0);context!.clearRect(0,0,width,height);
   if(analyser&&active)analyser.getFloatTimeDomainData(samples);
   const rms=active?Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length):0;node.dataset.level=String(Math.round(rms*10000)/10000);
   const count=Math.max(16,Math.min(64,Math.floor(width/5))),step=width/count;
   for(let index=0;index<count;index++){
    let energy=lastBars.current[index]??0;
    if(analyser&&active){const start=Math.floor(index/count*samples.length),end=Math.floor((index+1)/count*samples.length);let sum=0;for(let n=start;n<end;n++)sum+=samples[n]*samples[n];energy=Math.min(1,Math.sqrt(sum/Math.max(1,end-start))*5);lastBars.current[index]=energy;}
    const bar=Math.max(3,energy*(height-5));context!.fillStyle=played.current===undefined?(active?'#a7c9c3':'#77818c'):(index/count*100<played.current?'#a3c7c1':'#68737d');context!.beginPath();context!.roundRect(index*step+1,(height-bar)/2,Math.max(2,step-2),bar,2);context!.fill();
   }
  }
  paint.current=draw;draw(1000);function tick(now:number){draw(now);frame=requestAnimationFrame(tick);}if(active)frame=requestAnimationFrame(tick);const resize=new ResizeObserver(()=>draw(performance.now()+150));resize.observe(node);return()=>{cancelAnimationFrame(frame);resize.disconnect();paint.current=undefined;};
 },[analyser,active]);
 useEffect(()=>{if(!active)paint.current?.(performance.now()+150);},[progress,active]);
 return <canvas ref={canvas} className="audio-spectrum" role="img" aria-label={label}/>;
}
