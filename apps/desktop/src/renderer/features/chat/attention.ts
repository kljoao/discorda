import {useEffect,useRef,useState} from 'react';
import type {ChatWorkspace} from '../../../shared/ipc/contracts';
export function newer(id:string,previous?:string){return /^[1-9]\d{0,18}$/.test(id)&&BigInt(id)<=9223372036854775807n&&(!previous||BigInt(id)>BigInt(previous));}
export function readMarkers(value:string|null):Record<string,string>{try{const parsed=JSON.parse(value??'{}');return Object.fromEntries(Object.entries(parsed).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&newer(entry[1])));}catch{return {};}}
export function useChatAttention(workspace:ChatWorkspace|undefined){
 const [read,setRead]=useState<Record<string,string>>({}),[heads,setHeads]=useState<Record<string,string>>({}),[notifications,setNotifications]=useState(false),[mentionsOnly,setMentionsOnly]=useState(false),[muted,setMuted]=useState<string[]>([]);
 const headRef=useRef(heads);headRef.current=heads;const pending=useRef(new Map<string,string>());
 const key=workspace?'discorda:attention:'+workspace.id+':'+workspace.userId:undefined;
 useEffect(()=>{if(!key)return;pending.current.clear();try{setRead(readMarkers(localStorage.getItem(key)));setNotifications(localStorage.getItem(key+':notify')==='true');setMentionsOnly(localStorage.getItem(key+':mentions')==='true');const channels=JSON.parse(localStorage.getItem(key+':muted')??'[]');setMuted(Array.isArray(channels)?channels.filter(c=>typeof c==='string'):[]);}catch{setRead({});setMuted([]);setNotifications(false);}},[key]);
 useEffect(()=>{if(!workspace)return;setHeads(previous=>{const next={...previous};for(const c of workspace.channels)if(c.lastMessageId&&newer(c.lastMessageId,next[c.id]))next[c.id]=c.lastMessageId;headRef.current=next;return next;});},[workspace]);
 useEffect(()=>{if(!key)return;let active=true,busy=false;async function synchronize(){if(busy)return;busy=true;try{
   for(const [channelId,id] of [...pending.current]){const result=await window.discorda?.chat({kind:'read',channelId,id});if(result?.ok&&pending.current.get(channelId)===id)pending.current.delete(channelId);}
   const result=await window.discorda?.chat({kind:'reads'});if(active&&result?.ok){const remote=readMarkers(JSON.stringify(result.data));setRead(previous=>{const next={...previous};for(const [channel,id] of Object.entries(remote))if(newer(id,next[channel]))next[channel]=id;try{localStorage.setItem(key!,JSON.stringify(next));}catch{}return next;});}
 }catch{}finally{busy=false;}}void synchronize();const timer=setInterval(()=>void synchronize(),10000);const off=window.discorda?.onLiveEvent(e=>{if(e.kind==='connection'&&e.data==='connected')void synchronize();});return()=>{active=false;clearInterval(timer);off?.();};},[key]);
 useEffect(()=>window.discorda?.onLiveEvent(e=>{if(e.kind!=='message'||!workspace)return;const m=e.data;if(!newer(m.id,headRef.current[m.channelId]))return;headRef.current={...headRef.current,[m.channelId]:m.id};setHeads(headRef.current);if(notifications&&!muted.includes(m.channelId)&&m.authorId!==workspace.userId&&!m.deletedAt&&(!mentionsOnly||m.body.includes('<@'+workspace.userId+'>')))void window.discorda?.notifyMessage(m.channelId).catch(()=>{});}),[workspace?.userId,notifications,mentionsOnly,muted]);
 function markRead(channelId:string,id:string){if(!key)return;setRead(previous=>{if(!newer(id,previous[channelId]))return previous;const next={...previous,[channelId]:id};pending.current.set(channelId,id);try{localStorage.setItem(key,JSON.stringify(next));}catch{}return next;});}
 function toggleNotifications(){setNotifications(value=>{try{if(key)localStorage.setItem(key+':notify',String(!value));}catch{}return !value;});}
 function toggleMentions(){setMentionsOnly(value=>{try{if(key)localStorage.setItem(key+':mentions',String(!value));}catch{}return !value;});}
 function toggleMuted(id:string){setMuted(previous=>{const next=previous.includes(id)?previous.filter(c=>c!==id):[...previous,id];try{if(key)localStorage.setItem(key+':muted',JSON.stringify(next));}catch{}return next;});}
 return {unread:(id:string)=>!!heads[id]&&newer(heads[id],read[id]),markRead,notifications,toggleNotifications,mentionsOnly,toggleMentions,muted,toggleMuted};
}
