import {useEffect,useRef,useState} from 'react';
import type {ChatWorkspace} from '../../../shared/ipc/contracts';
export function newer(id:string,previous?:string){return /^\d{1,19}$/.test(id)&&(!previous||BigInt(id)>BigInt(previous));}
export function readMarkers(value:string|null):Record<string,string>{try{const parsed=JSON.parse(value??'{}');return Object.fromEntries(Object.entries(parsed).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&/^\d{1,19}$/.test(entry[1])));}catch{return {};}}
export function useChatAttention(workspace:ChatWorkspace|undefined){
 const [read,setRead]=useState<Record<string,string>>({}),[heads,setHeads]=useState<Record<string,string>>({}),[notifications,setNotifications]=useState(false),[muted,setMuted]=useState<string[]>([]);
 const headRef=useRef(heads);headRef.current=heads;
 const key=workspace?'discorda:attention:'+workspace.id+':'+workspace.userId:undefined;
 useEffect(()=>{if(!key)return;try{setRead(readMarkers(localStorage.getItem(key)));setNotifications(localStorage.getItem(key+':notify')==='true');const channels=JSON.parse(localStorage.getItem(key+':muted')??'[]');setMuted(Array.isArray(channels)?channels.filter(c=>typeof c==='string'):[]);}catch{setRead({});setMuted([]);setNotifications(false);}},[key]);
 useEffect(()=>{if(!workspace)return;setHeads(previous=>{const next={...previous};for(const c of workspace.channels)if(c.lastMessageId&&newer(c.lastMessageId,next[c.id]))next[c.id]=c.lastMessageId;headRef.current=next;return next;});},[workspace]);
 useEffect(()=>window.discorda?.onLiveEvent(e=>{if(e.kind!=='message'||!workspace)return;const m=e.data;if(!newer(m.id,headRef.current[m.channelId]))return;headRef.current={...headRef.current,[m.channelId]:m.id};setHeads(headRef.current);if(notifications&&!muted.includes(m.channelId)&&m.authorId!==workspace.userId&&!m.deletedAt)void window.discorda?.notifyMessage(m.channelId).catch(()=>{});}),[workspace?.userId,notifications,muted]);
 function markRead(channelId:string,id:string){if(!key)return;setRead(previous=>{if(!newer(id,previous[channelId]))return previous;const next={...previous,[channelId]:id};try{localStorage.setItem(key,JSON.stringify(next));}catch{}return next;});}
 function toggleNotifications(){setNotifications(value=>{try{if(key)localStorage.setItem(key+':notify',String(!value));}catch{}return !value;});}
 function toggleMuted(id:string){setMuted(previous=>{const next=previous.includes(id)?previous.filter(c=>c!==id):[...previous,id];try{if(key)localStorage.setItem(key+':muted',JSON.stringify(next));}catch{}return next;});}
 return {unread:(id:string)=>!!heads[id]&&newer(heads[id],read[id]),markRead,notifications,toggleNotifications,muted,toggleMuted};
}
