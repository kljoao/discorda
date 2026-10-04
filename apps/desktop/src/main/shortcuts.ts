import {app,globalShortcut} from 'electron';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import path from 'node:path';
import type {ShortcutSettings} from '../shared/ipc/contracts';

export function validAccelerator(value:unknown):value is string{return typeof value==='string'&&(/^(F[1-9]|F1[0-2])$/.test(value)||/^(Control\+)?(Alt\+)?(Shift\+)?[A-Z0-9]$/.test(value)&&/^(Control|Alt)\+/.test(value));}
export function validateShortcuts(value:unknown):asserts value is ShortcutSettings {
  if(!value||typeof value!=='object')throw Error('Atalhos inválidos.');
  const s=value as ShortcutSettings;
  if(typeof s.enabled!=='boolean'||typeof s.pushToTalk!=='boolean'||!validAccelerator(s.mute)||[s.deafen,s.cinema].some(v=>v!==undefined&&v!==''&&!validAccelerator(v))||!/^F([1-9]|1[0-2])$/.test(s.talk)||new Set([s.mute,s.deafen,s.cinema,...s.pushToTalk?[s.talk]:[]].filter(Boolean)).size!==[s.mute,s.deafen,s.cinema,...s.pushToTalk?[s.talk]:[]].filter(Boolean).length)throw Error('Escolha atalhos válidos e diferentes.');
}
export class Shortcuts {
  private child?:ChildProcessWithoutNullStreams;
  private registered:string[]=[];
  constructor(private emit:(event:'mute'|'deafen'|'cinema'|'unavailable'|boolean)=>void){}
  stop(){for(const key of this.registered)globalShortcut.unregister(key);this.registered=[];const child=this.child;this.child=undefined;child?.kill();this.emit(false);}
  configure(value:unknown){
    this.stop();validateShortcuts(value);if(!value.enabled)return;
    for(const kind of ['mute','deafen','cinema'] as const){const key=value[kind];if(!key)continue;if(!globalShortcut.register(key,()=>this.emit(kind))){this.stop();throw Error('Atalho '+key+' ocupado. Escolha outro.');}this.registered.push(key);}
    if(!value.pushToTalk)return;
    if(process.platform!=='win32'){this.stop();throw Error('Pressionar para falar global requer Windows nesta versão.');}
    const executable=path.join(app.isPackaged?process.resourcesPath:path.join(app.getAppPath(),'resources'),'windows-audio','Discorda.Audio.exe');
    const child=spawn(executable,['ptt',String(process.pid),String(111+Number(value.talk.slice(1)))],{windowsHide:true,stdio:'pipe'});this.child=child;
    child.stdin.on('error',()=>{});let buffer='';
    child.stdout.on('data',(chunk:Buffer)=>{if(this.child!==child)return;buffer+=chunk.toString();if(buffer.length>1024){child.kill();return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(line==='1'||line==='0')this.emit(line==='1');}});
    const stopped=()=>{if(this.child===child){this.child=undefined;this.emit(false);this.emit('unavailable');}};child.on('error',stopped);child.on('exit',stopped);
  }
}
