import {useEffect,useState} from 'react';
type Preferences={font:number;contrast:boolean;motion:boolean};
export function readAccessibility():Preferences{try{const p=JSON.parse(localStorage.getItem('discorda:accessibility')??'{}');return {font:[100,110,125,150].includes(p.font)?p.font:100,contrast:p.contrast===true,motion:p.motion===true};}catch{return {font:100,contrast:false,motion:false};}}
export function applyAccessibility(p:Preferences){document.documentElement.dataset.font=String(p.font);document.documentElement.dataset.contrast=String(p.contrast);document.documentElement.dataset.motion=p.motion?'reduced':'system';}
export function Accessibility(){
 const [value,setValue]=useState(readAccessibility);
 useEffect(()=>{applyAccessibility(value);try{localStorage.setItem('discorda:accessibility',JSON.stringify(value));}catch{}},[value]);
 return <section className="accessibility-settings"><h3>Conforto e acessibilidade</h3><label>Tamanho do texto<select value={value.font} onChange={e=>setValue({...value,font:Number(e.target.value)})}>{[100,110,125,150].map(size=><option key={size} value={size}>{size}%</option>)}</select></label><label><input type="checkbox" checked={value.contrast} onChange={e=>setValue({...value,contrast:e.target.checked})}/> Alto contraste</label><label><input type="checkbox" checked={value.motion} onChange={e=>setValue({...value,motion:e.target.checked})}/> Reduzir animações</label><p>A preferência de movimento do Windows também é respeitada. Use Tab para navegar, Enter para ativar e Escape para fechar diálogos.</p><button onClick={()=>setValue({font:100,contrast:false,motion:false})}>Restaurar aparência padrão</button></section>;
}
