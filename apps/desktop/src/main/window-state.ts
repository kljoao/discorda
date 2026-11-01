import {readFileSync,writeFileSync} from 'node:fs';
import type {BrowserWindow,Rectangle} from 'electron';

export type WindowState={bounds:Rectangle;maximized:boolean};

export function restoreWindowState(value:unknown,areas:Rectangle[]):WindowState|undefined {
  if(!value||typeof value!=='object'||!areas.length)return;
  const {bounds,maximized}=value as Partial<WindowState>;
  if(!bounds||typeof maximized!=='boolean'||!['x','y','width','height'].every(key=>Number.isSafeInteger(bounds[key as keyof Rectangle]))||bounds.width<840||bounds.height<620)return;
  // A monitor can have been unplugged while the application was updating.
  const area=areas.find(area=>bounds.x<area.x+area.width&&bounds.x+bounds.width>area.x&&bounds.y<area.y+area.height&&bounds.y+bounds.height>area.y)??areas[0];
  const width=Math.max(840,Math.min(bounds.width,area.width)),height=Math.max(620,Math.min(bounds.height,area.height));
  return {maximized,bounds:{width,height,x:Math.max(area.x,Math.min(bounds.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(bounds.y,area.y+area.height-height))}};
}

export function readWindowState(file:string,areas:Rectangle[]) {
  try{return restoreWindowState(JSON.parse(readFileSync(file,'utf8')),areas);}catch{return undefined;}
}

export function saveWindowState(file:string,window:BrowserWindow) {
  try{writeFileSync(file,JSON.stringify({bounds:window.getNormalBounds(),maximized:window.isMaximized()}),{mode:0o600});}catch{/* Window placement must not prevent a verified update. */}
}
