import {publicOperations,type Report} from '../shared/operations';
import {dialog,BrowserWindow} from 'electron';
import {writeFile} from 'node:fs/promises';
import type {AuthController} from './auth/auth-controller';
import type {AdminAction,ChatResult} from '../shared/ipc/contracts';
export function validateAdminAction(value:unknown):asserts value is AdminAction {
 if(!value||typeof value!=='object')throw Error('Invalid admin request');const a=value as Record<string,unknown>;
 if(['settings','users','network','firewall','operations','operationsExport'].includes(String(a.kind)))return;
 if(a.kind==='setup'&&typeof a.name==='string'&&a.name.trim().length>0&&a.name.length<=80&&[a.textChannels,a.voiceChannels].every(list=>Array.isArray(list)&&list.length<=10&&list.every(n=>typeof n==='string'&&n.trim().length>0&&n.length<=80&&!/[\x00-\x1f]/.test(n))))return;
 if(a.kind==='user'&&typeof a.email==='string'&&a.email.length<=320&&/^[^\s@]+@[^\s@]+$/.test(a.email)&&typeof a.enabled==='boolean')return;
 if(a.kind==='networkSave'&&Array.isArray(a.addresses)&&a.addresses.length<=100&&a.addresses.every(v=>typeof v==='string'&&/^26\.(\d{1,3}\.){2}\d{1,3}$/.test(v)&&v.split('.').every(n=>Number(n)<=255)))return;
 throw Error('Invalid admin request');
}
export async function adminAction(auth:AuthController,value:unknown,window:BrowserWindow):Promise<ChatResult>{
 validateAdminAction(value);
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
