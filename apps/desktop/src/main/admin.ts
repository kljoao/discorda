import {inviteLink} from './server-library';
import {publicOperations,type Report} from '../shared/operations';
import {clipboard,dialog,BrowserWindow} from 'electron';
import {writeFile} from 'node:fs/promises';
import type {AuthController} from './auth/auth-controller';
import type {AdminAction,ChatResult} from '../shared/ipc/contracts';
export function validateAdminAction(value:unknown):asserts value is AdminAction {
 if(!value||typeof value!=='object')throw Error('Invalid admin request');const a=value as Record<string,unknown>;
 if(['invites','joinRequests','storagePolicy','storagePreview'].includes(String(a.kind)))return;
 if(a.kind==='inviteCreate'&&Number.isInteger(a.hours)&&Number(a.hours)>=1&&Number(a.hours)<=168&&Number.isInteger(a.maxUses)&&Number(a.maxUses)>=1&&Number(a.maxUses)<=100)return;
 if((a.kind==='inviteRevoke'||(a.kind==='joinReview'&&typeof a.approve==='boolean'))&&typeof a.id==='string'&&/^[0-9a-f-]{36}$/i.test(a.id))return;
 if(a.kind==='storageSave'&&Number.isInteger(a.quotaMiB)&&Number(a.quotaMiB)>=16&&Number(a.quotaMiB)<=10240&&Number.isInteger(a.retentionDays)&&Number(a.retentionDays)>=0&&Number(a.retentionDays)<=3650&&Number.isInteger(a.version)&&Number(a.version)>0)return;
 if(a.kind==='storageCleanup'&&typeof a.cutoff==='string'&&a.cutoff.length<40&&Number.isFinite(Date.parse(a.cutoff))&&typeof a.fingerprint==='string'&&/^[0-9A-F]{64}$/.test(a.fingerprint))return;
 if(a.kind==='attachments' &&(a.before===undefined||(typeof a.before==='string'&&/^[1-9]\d{0,18}$/.test(a.before)&&BigInt(a.before)<=9223372036854775807n)))return;
 if(a.kind==='attachmentDelete'&&typeof a.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.id))return;
 if(['settings','users','network','firewall','operations','operationsExport'].includes(String(a.kind)))return;
 if(a.kind==='setup'&&typeof a.name==='string'&&a.name.trim().length>0&&a.name.length<=80&&[a.textChannels,a.voiceChannels].every(list=>Array.isArray(list)&&list.length<=10&&list.every(n=>typeof n==='string'&&n.trim().length>0&&n.length<=80&&!/[\x00-\x1f]/.test(n))))return;
 if(a.kind==='user'&&typeof a.email==='string'&&a.email.length<=320&&/^[^\s@]+@[^\s@]+$/.test(a.email)&&typeof a.enabled==='boolean')return;
 if(a.kind==='networkSave'&&Array.isArray(a.addresses)&&a.addresses.length<=100&&a.addresses.every(v=>typeof v==='string'&&/^26\.(\d{1,3}\.){2}\d{1,3}$/.test(v)&&v.split('.').every(n=>Number(n)<=255)))return;
 throw Error('Invalid admin request');
}
export async function adminAction(auth:AuthController,value:unknown,window:BrowserWindow,origin?:string):Promise<ChatResult>{
 validateAdminAction(value);
 if(value.kind==='invites')return auth.chatRequest('/invites','GET',undefined,'admin');
 if(value.kind==='joinRequests')return auth.chatRequest('/join-requests','GET',undefined,'admin');
 if(value.kind==='inviteRevoke')return auth.chatRequest('/invites/'+value.id,'DELETE',undefined,'admin');
 if(value.kind==='joinReview')return auth.chatRequest('/join-requests/'+value.id,'PUT',{approve:value.approve},'admin');
 if(value.kind==='inviteCreate'){if(!origin)return {ok:false,message:'Servidor indisponível.'};const r=await auth.chatRequest('/invites','POST',{hours:value.hours,maxUses:value.maxUses},'admin');if(!r.ok)return r;const data=r.data as {token:string;expiresAt:string};if(!/^[0-9a-f]{64}$/.test(data.token))return {ok:false,message:'Convite inválido.'};const link=inviteLink(origin,data.token);clipboard.writeText(link);return {ok:true,data:{link,expiresAt:data.expiresAt}};}
 if(value.kind==='storagePolicy')return auth.chatRequest('/storage/policy','GET',undefined,'admin');
 if(value.kind==='storagePreview')return auth.chatRequest('/storage/preview','POST',{},'admin');
 if(value.kind==='storageSave')return auth.chatRequest('/storage/policy','PUT',{quotaMiB:value.quotaMiB,retentionDays:value.retentionDays,version:value.version},'admin');
 if(value.kind==='storageCleanup')return auth.chatRequest('/storage/cleanup','POST',{cutoff:value.cutoff,fingerprint:value.fingerprint},'admin');
 if(value.kind==='attachments')return auth.chatRequest('/attachments'+(value.before?'?before='+value.before:''),'GET',undefined,'admin');
 if(value.kind==='attachmentDelete')return auth.chatRequest('/attachments/'+value.id,'DELETE',undefined,'admin');
 if(value.kind==='operationsExport'){
  const result=await auth.chatRequest('/operations','GET',undefined,'admin');if(!result.ok)return result;
  const report=publicOperations(result.data as Report);
  const target=await dialog.showSaveDialog(window,{title:'Exportar saúde do servidor',defaultPath:'discorda-saude-servidor.json',filters:[{name:'JSON',extensions:['json']}]});
  if(!target.canceled&&target.filePath)await writeFile(target.filePath,JSON.stringify(report,null,2),'utf8');
  return {ok:true,data:{saved:!target.canceled}};
 }
 if(value.kind==='firewall'){
  const result=await auth.chatRequest('/network/script','GET',undefined,'admin');if(!result.ok)return result;
  if(typeof result.data!=='string'||result.data.length>65536)return {ok:false,message:'Resposta inválida do servidor.'};
  const target=await dialog.showSaveDialog(window,{title:'Salvar política de Firewall para aplicar no host',defaultPath:'discorda-firewall.ps1',filters:[{name:'PowerShell',extensions:['ps1']}]});
  if(!target.canceled&&target.filePath)await writeFile(target.filePath,result.data,'utf8');
  return {ok:true,data:{saved:!target.canceled}};
 }
 if(value.kind==='setup')return auth.chatRequest('/setup','PUT',{name:value.name,textChannels:value.textChannels,voiceChannels:value.voiceChannels},'admin');
 if(value.kind==='user')return auth.chatRequest('/users','PUT',{email:value.email,enabled:value.enabled},'admin');
 if(value.kind==='networkSave')return auth.chatRequest('/network','PUT',{addresses:value.addresses},'admin');
 return auth.chatRequest('/'+value.kind,'GET',undefined,'admin');
}
