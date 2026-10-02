import {app,globalShortcut} from 'electron';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import path from 'node:path';
import type {ShortcutSettings} from '../shared/ipc/contracts';

export function validateShortcuts(value:unknown):asserts value is ShortcutSettings {
  if(!value||typeof value!=='object')throw Error('Atalhos inválidos.');
  const s=value as ShortcutSettings;
  if(typeof s.enabled!=='boolean'||typeof s.pushToTalk!=='boolean'||!['Control+Shift+M','Control+Alt+M','F8','F9','F10'].includes(s.mute)||!/^F([1-9]|1[0-2])$/.test(s.talk)||s.mute===s.talk)throw Error('Escolha atalhos válidos e diferentes.');
}
export class Shortcuts {
  private child?:ChildProcessWithoutNullStreams;
  private mute?:string;
  constructor(private emit:(event:'mute'|'unavailable'|boolean)=>void){}
  stop(){if(this.mute)globalShortcut.unregister(this.mute);this.mute=undefined;const child=this.child;this.child=undefined;child?.kill();this.emit(false);}
  configure(value:unknown){
    validateShortcuts(value);this.stop();if(!value.enabled)return;
    if(!globalShortcut.register(value.mute,()=>this.emit('mute')))throw Error('Atalho ocupado por outro aplicativo. Escolha outro.');
    this.mute=value.mute;if(!value.pushToTalk)return;
    if(process.platform!=='win32'){this.stop();throw Error('Pressionar para falar global requer Windows nesta versão.');}
    const executable=path.join(app.isPackaged?process.resourcesPath:path.join(app.getAppPath(),'resources'),'windows-audio','Discorda.Audio.exe');
    const child=spawn(executable,['ptt',String(process.pid),String(111+Number(value.talk.slice(1)))],{windowsHide:true,stdio:'pipe'});this.child=child;
    child.stdin.on('error',()=>{});let buffer='';
    child.stdout.on('data',(chunk:Buffer)=>{if(this.child!==child)return;buffer+=chunk.toString();if(buffer.length>1024){child.kill();return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(line==='1'||line==='0')this.emit(line==='1');}});
    const stopped=()=>{if(this.child===child){this.child=undefined;this.emit(false);this.emit('unavailable');}};child.on('error',stopped);child.on('exit',stopped);
  }
}
